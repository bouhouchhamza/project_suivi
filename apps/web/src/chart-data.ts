export type LabeledCount = { label: string; count: number };
export type LabeledDeliverables = { label: string; deliverables: number };

export type ChartDataset = {
  labels: string[];
  values: number[];
  colors: string[];
  total: number;
  isEmpty: boolean;
};

const PRIORITY_ORDER = ['HAUTE', 'MOYENNE', 'BASSE'] as const;
const PRIORITY_LABELS: Record<string, string> = { HAUTE: 'Haute', MOYENNE: 'Moyenne', BASSE: 'Basse' };
const PRIORITY_COLORS: Record<string, string> = { HAUTE: '#B3452E', MOYENNE: '#B4832A', BASSE: '#5B6572' };
const NO_PRIORITY_LABEL = 'Sans priorité';
const NO_PRIORITY_COLOR = '#8A93A0';

export const DEPARTMENT_ORDER = ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM'] as const;
const DEPARTMENT_COLOR = '#2F6B60';
const CHEF_COLOR = '#2F6B60';
const OTHERS_LABEL = 'Autres';

function buildDataset(labels: string[], values: number[], colors: string[]): ChartDataset {
  const total = values.reduce((sum, v) => sum + v, 0);
  return { labels, values, colors, total, isEmpty: total === 0 };
}

export function buildPriorityChart(byPriority: LabeledCount[] = []): ChartDataset {
  const byLabel = new Map(byPriority.map(x => [x.label, x.count]));
  const labels = PRIORITY_ORDER.map(key => PRIORITY_LABELS[key]);
  const values = PRIORITY_ORDER.map(key => byLabel.get(key) ?? 0);
  const colors = PRIORITY_ORDER.map(key => PRIORITY_COLORS[key]);
  if (byLabel.has(NO_PRIORITY_LABEL)) {
    labels.push(NO_PRIORITY_LABEL);
    values.push(byLabel.get(NO_PRIORITY_LABEL) ?? 0);
    colors.push(NO_PRIORITY_COLOR);
  }
  return buildDataset(labels, values, colors);
}

export function buildDepartmentChart(byDepartment: LabeledDeliverables[] = []): ChartDataset {
  const byLabel = new Map(byDepartment.map(x => [x.label, x.deliverables]));
  const labels: string[] = [...DEPARTMENT_ORDER];
  const values = DEPARTMENT_ORDER.map(dep => byLabel.get(dep) ?? 0);
  const colors = DEPARTMENT_ORDER.map(() => DEPARTMENT_COLOR);
  return buildDataset(labels, values, colors);
}

export function buildChefChart(byChef: LabeledCount[] = [], limit = 8): ChartDataset {
  const sorted = [...byChef].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const restTotal = rest.reduce((sum, x) => sum + x.count, 0);
  const labels = top.map(x => x.label);
  const values = top.map(x => x.count);
  if (restTotal > 0) {
    labels.push(OTHERS_LABEL);
    values.push(restTotal);
  }
  const colors = labels.map(() => CHEF_COLOR);
  return buildDataset(labels, values, colors);
}

export type DeadlineKpis = {
  overdueDeliverables: number;
  dueTodayDeliverables: number;
  dueNext7DaysDeliverables: number;
  dueNext30DaysDeliverables: number;
};

export function buildDeadlineChart(kpis: DeadlineKpis | null | undefined): ChartDataset {
  const labels = ['En retard', "Aujourd'hui", '7 jours', '30 jours'];
  const values = [
    kpis?.overdueDeliverables ?? 0,
    kpis?.dueTodayDeliverables ?? 0,
    kpis?.dueNext7DaysDeliverables ?? 0,
    kpis?.dueNext30DaysDeliverables ?? 0,
  ];
  const colors = ['#B3452E', '#B4832A', '#4C7A5C', '#5B6572'];
  return buildDataset(labels, values, colors);
}

export function chartSummary(dataset: ChartDataset): string {
  return dataset.labels.map((label, i) => `${label}: ${dataset.values[i]}`).join(', ');
}
