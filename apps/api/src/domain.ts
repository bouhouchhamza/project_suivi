import { Department, Phase, Priority } from '@prisma/client';
import { z } from 'zod';

export const DEPARTMENTS: Department[] = ['STR','ECO','FLU','ELEC','VRD','BIM'];
export const PHASES: Phase[] = ['APS','APD','DCE','EXE'];
export const PRIORITIES: Priority[] = ['HAUTE','MOYENNE','BASSE'];

const PRIORITY_RANK: Record<Priority, number> = { HAUTE: 0, MOYENNE: 1, BASSE: 2 };
export const priorityRank = (priorite: Priority | null) => priorite ? PRIORITY_RANK[priorite] : PRIORITIES.length;
export function compareProjectOrder(a: { priorite: Priority | null; priorityOrder: number }, b: { priorite: Priority | null; priorityOrder: number }) {
  return priorityRank(a.priorite) - priorityRank(b.priorite) || a.priorityOrder - b.priorityOrder;
}

export const CLIENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
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

export const validateClientSlug = (value: string) => CLIENT_SLUG_PATTERN.test(value);

export const savedViewFiltersSchema = z.object({
  priorities: z.array(z.nativeEnum(Priority)).default([]),
  chef: z.string().nullable().default(null),
  department: z.nativeEnum(Department).nullable().default(null),
  departments: z.array(z.nativeEnum(Department)).default([]),
  search: z.string().default(''),
  archived: z.boolean().default(false),
});

export function daysUntil(dateOnlyValue: string | null, today = new Date()) {
  if (!dateOnlyValue) return null;
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const due = new Date(`${dateOnlyValue}T00:00:00.000Z`);
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

export const isOverdueDate = (dateOnlyValue: string | null, today = new Date()) => {
  const days = daysUntil(dateOnlyValue, today);
  return days !== null && days < 0;
};

type ProjectForKpis = {
  archivedAt?: string | Date | null;
  priorite: Priority | null;
  lignes: Array<{ dateLivrable: string | null; departement: Department }>;
};

export const isActiveProject = (project: { archivedAt?: string | Date | null }) => !project.archivedAt;

export const projectHasOverdueDeliverable = (project: ProjectForKpis, today = new Date()) =>
  isActiveProject(project) && project.lignes.some(line => isOverdueDate(line.dateLivrable, today));

export function projectKpis(projects: Array<{ archivedAt?: string | Date | null; priorite: Priority | null; lignes: Array<{ dateLivrable: string | null; departement: Department }> }>, today = new Date()) {
  const active = projects.filter(isActiveProject);
  const archived = projects.filter(p => p.archivedAt);
  const deadlineLines = active.flatMap(project => project.lignes.map(line => ({ project, line, days: daysUntil(line.dateLivrable, today) })));
  return {
    activeProjects: active.length,
    archivedProjects: archived.length,
    highPriorityProjects: active.filter(p => p.priorite === Priority.HAUTE).length,
    overdueDeliverables: deadlineLines.filter(x => x.days !== null && x.days < 0).length,
    dueTodayDeliverables: deadlineLines.filter(x => x.days === 0).length,
    dueNext7DaysDeliverables: deadlineLines.filter(x => x.days !== null && x.days >= 0 && x.days <= 7).length,
    dueNext30DaysDeliverables: deadlineLines.filter(x => x.days !== null && x.days >= 0 && x.days <= 30).length,
  };
}

export function serializeProject(p: any) {
  const fixedLines = DEPARTMENTS.map(departement => {
    const l = p.lignes.find((x: any) => x.departement === departement);
    return l ? { ...l, dateLivrable: dateOnly(l.dateLivrable) } : { departement, phase:null, delaiJours:null, dateLivrable:null, commentaire:null };
  });
  return {
    ...p,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
    archivedAt: p.archivedAt?.toISOString?.() ?? p.archivedAt ?? null,
    lignes: fixedLines,
  };
}
