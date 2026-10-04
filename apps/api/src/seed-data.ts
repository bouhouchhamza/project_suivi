import { Priority } from '@prisma/client';
import { prisma } from './db.js';
import { DEPARTMENTS, normalizeManager } from './domain.js';

const managers=['AMINA BOUABDALLAOUI','BRAHIM CHADLI','OMAR BOUKHRIS','ABDELRHAFOUR EL HADRI','ATMANE ADDIOUI','KAMAL EL AMARTI','OMAR YAZIDI'];
const projects:[string,number,string,Priority][]=[
 ['AMINA BOUABDALLAOUI',342,'Projet 342',Priority.MOYENNE],['AMINA BOUABDALLAOUI',473,'Projet 473',Priority.MOYENNE],['AMINA BOUABDALLAOUI',452,'Projet 452',Priority.BASSE],['AMINA BOUABDALLAOUI',453,'Projet 453',Priority.BASSE],['AMINA BOUABDALLAOUI',467,'Projet 467',Priority.BASSE],['AMINA BOUABDALLAOUI',468,'Projet 468',Priority.BASSE],
 ['BRAHIM CHADLI',447,'Projet 447',Priority.HAUTE],['BRAHIM CHADLI',462,'Projet 462',Priority.BASSE],['BRAHIM CHADLI',472,'Projet 472',Priority.HAUTE],['BRAHIM CHADLI',434,'Projet 434',Priority.HAUTE],['BRAHIM CHADLI',430,'Projet 430',Priority.HAUTE],['BRAHIM CHADLI',387,'Projet 387',Priority.HAUTE],
 ['OMAR BOUKHRIS',476,'Projet 476',Priority.HAUTE],['OMAR BOUKHRIS',451,'Projet 451',Priority.HAUTE],['OMAR BOUKHRIS',432,'Projet 432',Priority.MOYENNE],['OMAR BOUKHRIS',439,'Projet 439',Priority.BASSE],['OMAR BOUKHRIS',440,'Projet 440',Priority.BASSE],
 ['ATMANE ADDIOUI',463,'CHU',Priority.HAUTE],['ATMANE ADDIOUI',463,'PFSS',Priority.MOYENNE],['ATMANE ADDIOUI',436,'Projet 436',Priority.HAUTE],['ATMANE ADDIOUI',313,'Projet 313',Priority.MOYENNE],['ATMANE ADDIOUI',417,'Projet 417',Priority.BASSE],['ATMANE ADDIOUI',461,'Projet 461',Priority.HAUTE]
];
export async function seedBusinessData(userId:string){
  for(const name of managers) await prisma.manager.upsert({where:{normalized:normalizeManager(name)},update:{},create:{name,normalized:normalizeManager(name)}});
  const orderCounters=new Map<Priority,number>();
  for(const [chef,numero,intitule,priorite] of projects){
    const priorityOrder=(orderCounters.get(priorite)??-1)+1;
    orderCounters.set(priorite,priorityOrder);
    await prisma.project.create({data:{chef,numero,intitule,priorite,priorityOrder,updatedBy:userId,lignes:{create:DEPARTMENTS.map(departement=>({departement}))}}});
  }
  return projects.length;
}
