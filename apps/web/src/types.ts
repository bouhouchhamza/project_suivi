export type Role='admin'|'editor'|'viewer';
export type Priority='HAUTE'|'MOYENNE'|'BASSE';
export type Phase='APS'|'APD'|'DCE'|'EXE';
export type Department='STR'|'ECO'|'FLU'|'ELEC'|'VRD'|'BIM';
export const DEPARTMENTS:Department[]=['STR','ECO','FLU','ELEC','VRD','BIM'];

export interface ProjectLine {
  id?:string;
  departement:Department;
  phase:Phase|null;
  delaiJours:number|null;
  dateLivrable:string|null;
  commentaire:string|null;
}
export interface Project {
  id:string;
  numero:number;
  intitule:string;
  priorite:Priority|null;
  chef:string|null;
  lignes:ProjectLine[];
  updatedAt:string;
  updatedBy:string;
}
export interface User {id:string;name:string;email:string;role:Role|null}
export interface Manager {id:string;name:string}

export const emptyLines=()=>DEPARTMENTS.map(departement=>({departement,phase:null,delaiJours:null,dateLivrable:null,commentaire:null})) as ProjectLine[];
export const emptyProject=():Project=>({id:'',numero:0,intitule:'',priorite:null,chef:null,lignes:emptyLines(),updatedAt:new Date(0).toISOString(),updatedBy:''});
