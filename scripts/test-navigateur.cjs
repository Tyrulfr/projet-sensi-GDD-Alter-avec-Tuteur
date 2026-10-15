/* Run after build.sh. npm install, npx playwright install chromium, npm test. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  let server;
  let base = process.env.TEST_BASE_URL;
  if (!base) {
    const command = process.env.TEST_RL === '1'
      ? ['-u', '-m', 'govtutor_rl.cli', 'serve', '--site', '.', '--checkpoint', 'tuteur/models/governance_ppo.zip', '--port', '0']
      : ['-u', '-c', 'from http.server import HTTPServer,SimpleHTTPRequestHandler; s=HTTPServer(("127.0.0.1",0),SimpleHTTPRequestHandler); print(s.server_port,flush=True); s.serve_forever()'];
    server = spawn(process.env.PYTHON || 'python3', command,
      { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] });
    const port = await new Promise((resolve, reject) => {
      server.once('error', reject); server.stdout.once('data', d => {
        const text = d.toString();
        resolve(process.env.TEST_RL === '1' ? text.match(/127\.0\.0\.1:(\d+)/)[1] : text.trim());
      });
      server.once('exit', code => reject(new Error('HTTP server exited: ' + code)));
    });
    base = 'http://127.0.0.1:' + port;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/tests/');
    await page.waitForFunction(() => window.RESULTATS_TESTS && window.RESULTATS_TUTEUR);
    const tests = await page.evaluate(() => ({ formation: RESULTATS_TESTS, tuteur: RESULTATS_TUTEUR }));
    console.log(JSON.stringify(tests, null, 2));
    assert.equal(tests.formation.echecs, 0, 'Formation tests failed');
    assert.equal(tests.tuteur.echecs, 0, 'Tutor tests failed');

    await page.goto(base + '/#/module/m01/lecon/1');
    while (!(await page.locator('#act-m01-a1').count())) {
      await page.getByRole('button', { name: 'Continuer', exact: true }).click();
    }
    await page.locator('#act-m01-a1 input[value="d"]').check();
    await page.locator('#act-m01-a1').getByRole('button', { name: 'Valider ma réponse' }).click();
    await page.waitForSelector('.tuteur-exercice input');
    let info = await page.evaluate(() => GDD.app.moteur('m01').etat.t.o['os1-1']);
    assert.equal(info.n, 1); assert.equal(info.e, 1);
    // Answer the independent tutor exercise via the actual interface.
    const correct = await page.evaluate(() => GDD_CONTENU.tutorat.objectifs['os1-1'].questions[0].reponse);
    await page.locator('.tuteur-exercice input[value="' + correct + '"]').check();
    await page.locator('.tuteur-exercice').getByRole('button', { name: 'Valider ma réponse' }).click();
    info = await page.evaluate(() => ({ s: GDD.app.moteur('m01').etat.t.o['os1-1'], score: GDD.app.moteur('m01').statut().score }));
    assert.equal(info.s.n, 2); assert.equal(info.score, null);
    await page.getByRole('button', { name: 'Adapter la suite de mon entraînement' }).click();
    await page.waitForSelector('.tuteur-exercice input');
    assert.match(await page.locator('.tuteur-exercice').innerText(), /situation|interventions|hiver/i);
    await page.reload();
    await page.waitForSelector('.tuteur-exercice input');
    assert.equal(await page.evaluate(() => GDD.app.moteur('m01').etat.t.o['os1-1'].n), 2);
    await page.screenshot({ path: path.resolve(__dirname, '../dist/tuteur-activite.png'), fullPage: true, animations: 'disabled' });

    await page.goto(base + '/#/module/m01');
    await page.getByText('Historique récent et réglages du tuteur', { exact: true }).click();
    if (process.env.TEST_RL === '1') {
      const response = page.waitForResponse(r => r.url().endsWith('/api/tutor/status'));
      await page.getByRole('button', { name: 'Activer la politique RL locale' }).click();
      assert.equal((await response).status(), 200);
      await page.getByRole('button', { name: 'Revenir aux règles locales' }).waitFor();
      const decision = page.waitForResponse(r => r.url().endsWith('/api/tutor/recommend'));
      await page.goto(base + '/#/module/m01/lecon/1');
      const r = await decision; assert.equal(r.status(), 200); assert.equal((await r.json()).policy, 'rl');
      await page.waitForSelector('.tuteur-exercice input');
      await page.locator('.tuteur details summary').click();
      assert.match(await page.locator('.tuteur').innerText(), /Décision de la politique PPO/);
      // Failure must visibly fall back without blocking the formation.
      await page.route('**/api/tutor/recommend', r => r.abort());
      await page.goto(base + '/#/module/m01');
      await page.goto(base + '/#/module/m01/lecon/1');
      await page.getByText(/Le service RL est indisponible/).waitFor();
      await page.unroute('**/api/tutor/recommend');
    } else {
      await page.getByRole('button', { name: 'Activer la politique RL locale' }).click();
      await page.getByText(/Les règles restent actives/).waitFor();
    }
    // SCORM preview includes the tutor and never claims persistence without a LMS.
    await page.goto(base + '/dist/scorm/m01/index.html');
    await page.getByRole('heading', { name: 'Ton accompagnement personnalisé' }).waitFor();
    assert.match(await page.locator('.tuteur-bilan').innerText(), /ne sera pas enregistré/);
    const lms = await browser.newPage();
    await lms.addInitScript(() => {
      const values = { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.lesson_mode': 'normal',
        'cmi.core.entry': 'ab-initio', 'cmi.interactions._count': '0' };
      window.__lmsData = values;
      window.API = { LMSInitialize: () => 'true', LMSFinish: () => 'true', LMSCommit: () => 'true',
        LMSGetValue: k => values[k] || '', LMSSetValue: (k, v) => { values[k] = v; return 'true'; },
        LMSGetLastError: () => '0', LMSGetErrorString: () => '' };
    });
    await lms.goto(base + '/dist/scorm/m01/index.html#/lecon/1');
    while (!(await lms.locator('#act-m01-a1').count())) {
      await lms.getByRole('button', { name: 'Continuer', exact: true }).click();
    }
    await lms.locator('#act-m01-a1 input[value="d"]').check();
    await lms.locator('#act-m01-a1').getByRole('button', { name: 'Valider ma réponse' }).click();
    assert.equal(await lms.evaluate(() => JSON.parse(__lmsData['cmi.suspend_data']).t.o['os1-1'].n), 1);
    await lms.close();
    assert.deepEqual(errors, [], 'Unexpected browser exceptions');
    fs.writeFileSync(path.resolve(__dirname, '../dist/rapport-navigateur.json'), JSON.stringify({
      formation: tests.formation, tuteur: tests.tuteur,
      parcours: ['erreur formative', 'exercice adaptatif hors note', 'reprise après rechargement',
        process.env.TEST_RL === '1' ? 'PPO réel et secours local' : 'secours sans API', 'aperçu SCORM', 'sauvegarde tuteur dans une API SCORM simulée'], errors
    }, null, 2));
    console.log('Parcours navigateur validés (' + (process.env.TEST_RL === '1' ? 'PPO réel' : 'sans API') + ').');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
