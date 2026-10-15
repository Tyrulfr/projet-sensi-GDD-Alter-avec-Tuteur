Essai court :
  govtutor skills
  govtutor evaluate --episodes 12 --output results/example.csv
  govtutor train --steps 3000 --output models/demo
  govtutor evaluate --checkpoint models/demo --episodes 12
  govtutor lesson --skill catalog --checkpoint models/demo
