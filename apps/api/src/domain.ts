import { Department, Phase, Priority } from '@prisma/client';
import { z } from 'zod';

export const DEPARTMENTS: Department[] = ['STR','ECO','FLU','ELEC','VRD','BIM'];
const nullableEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    v => v === '' || v === undefined || v === null ? null : v,
    schema.nullable()
  );

export const isDateOnly = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
};

export const lineSchema = z.object({
  departement: z.nativeEnum(Department),
  phase: nullableEmpty(z.nativeEnum(Phase)),
  delaiJours: nullableEmpty(z.coerce.number().int().nonnegative()),
  dateLivrable: nullableEmpty(z.string()).superRefine((v, ctx) => {
    if (v && !isDateOnly(v)) ctx.addIssue({ code: 'custom', message: 'Date livrable invalide.' });
  }),
  commentaire: nullableEmpty(z.string().max(2000)),
});

export const projectSchema = z.object({
  numero: z.number().int(),
  intitule: z.string().trim().min(1).max(200),
  priorite: z.union([z.nativeEnum(Priority), z.null()]),
  chef: z.union([z.string().trim().min(1).max(120), z.null()]),
  lignes: z.array(lineSchema).length(6),
}).superRefine((p, ctx) => {
  const deps = p.lignes.map(l => l.departement);
  if (new Set(deps).size !== 6 || DEPARTMENTS.some((d, i) => deps[i] !== d)) {
    ctx.addIssue({ code: 'custom', path: ['lignes'], message: 'Les 6 départements doivent être présents dans l’ordre STR, ECO, FLU, ELEC, VRD, BIM.' });
  }
});

export const normalizeManager = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr');
export const normalizeTitle = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
export const sameImportProjectKey = (left: { numero: number; intitule: string }, right: { numero: number; intitule: string }) =>
  left.numero === right.numero && normalizeTitle(left.intitule) === normalizeTitle(right.intitule);
export const toDate = (value: string | null) => value ? new Date(`${value}T00:00:00.000Z`) : null;
export const dateOnly = (value: Date | null) => value ? value.toISOString().slice(0, 10) : null;

export function serializeProject(p: any) {
  const fixedLines = DEPARTMENTS.map(departement => {
    const l = p.lignes.find((x: any) => x.departement === departement);
    return l ? { ...l, dateLivrable: dateOnly(l.dateLivrable) } : { departement, phase:null, delaiJours:null, dateLivrable:null, commentaire:null };
  });
  return { ...p, updatedAt: p.updatedAt.toISOString(), createdAt: p.createdAt?.toISOString?.() ?? p.createdAt, lignes: fixedLines };
}
