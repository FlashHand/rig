import fs from 'fs';
import path from 'path';
import print from '../print';
import { CrewEntry, CrewProject, requireCrew, shortPath } from './config';
import { rootPath, writeText, readText } from './vault';

export interface PendingQuestion {
  id: string;
  title: string;
  asked: string;          // ISO date (YYYY-MM-DD)
  askedBy?: string;
  priority?: 'high' | 'medium' | 'low' | string;
  why?: string;
  need?: string;
  notes?: string;
  status: 'open' | 'resolved';
  resolved?: string;      // ISO date when resolved
  answer?: string;
  bodyExtras?: string;    // extra free-form body lines we want to preserve
}

interface PendingListOpts {
  crew?: string;
  project?: string;
  all?: boolean;
  json?: boolean;
}

interface PendingAddOpts {
  crew?: string;
  project?: string;
  why?: string;
  need?: string;
  priority?: string;
  askedBy?: string;
}

interface PendingAnswerOpts {
  crew?: string;
  project?: string;
  note?: string;
}

interface PendingRemoveOpts {
  crew?: string;
  project?: string;
}

export function pendingList(opts: PendingListOpts): void {
  const crew = requireCrew(opts.crew);
  const targets = resolveTargets(crew, opts.project);
  const includeResolved = !!opts.all;
  const result: { project: string; file: string; questions: PendingQuestion[] }[] = [];
  for (const project of targets) {
    const file = pendingFile(crew, project.name);
    const questions = readQuestions(file)
      .filter(q => includeResolved || q.status === 'open');
    result.push({ project: project.name, file, questions });
  }
  if (opts.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, data: result }, null, 2));
    return;
  }
  const total = result.reduce((sum, r) => sum + r.questions.length, 0);
  if (total === 0) {
    print.info(includeResolved
      ? 'no pending questions found.'
      : 'no open pending questions. Use --all to include resolved.');
    return;
  }
  print.info(`pending questions${includeResolved ? ' (all)' : ' (open)'}: ${total}`);
  for (const block of result) {
    if (block.questions.length === 0) continue;
    print.info(`project: ${block.project}  file: ${shortPath(block.file)}`);
    for (const q of block.questions) {
      const tag = q.status === 'resolved' ? '[resolved]' : `[${q.priority || 'open'}]`;
      // eslint-disable-next-line no-console
      console.log(`- ${q.id} ${tag} ${q.title}`);
      if (q.why) {
        // eslint-disable-next-line no-console
        console.log(`    why: ${q.why}`);
      }
      if (q.need) {
        // eslint-disable-next-line no-console
        console.log(`    need: ${q.need}`);
      }
      if (q.answer) {
        // eslint-disable-next-line no-console
        console.log(`    answer: ${q.answer}`);
      }
    }
  }
}

export function pendingAdd(titleParts: string[] | undefined, opts: PendingAddOpts): void {
  const crew = requireCrew(opts.crew);
  const project = resolveSingleProject(crew, opts.project, 'add');
  const title = (titleParts || []).join(' ').trim();
  if (!title) {
    print.error('missing question title. Usage: rig crew pending add "<title>" --project <name>');
    process.exit(1);
  }
  const file = pendingFile(crew, project.name);
  const questions = readQuestions(file);
  const id = nextQuestionId(questions);
  const today = isoDate(new Date());
  const question: PendingQuestion = {
    id,
    title,
    asked: today,
    askedBy: opts.askedBy,
    priority: opts.priority,
    why: opts.why,
    need: opts.need,
    status: 'open',
  };
  questions.push(question);
  writeQuestions(file, project, questions);
  print.succeed(`added ${id} to ${shortPath(file)}`);
}

export function pendingAnswer(id: string, opts: PendingAnswerOpts): void {
  const crew = requireCrew(opts.crew);
  const located = findQuestion(crew, id, opts.project);
  if (!located) {
    print.error(`question not found: ${id}`);
    process.exit(1);
  }
  const { project, questions, index } = located;
  const question = questions[index];
  question.status = 'resolved';
  question.resolved = isoDate(new Date());
  if (opts.note) question.answer = opts.note;
  writeQuestions(pendingFile(crew, project.name), project, questions);
  print.succeed(`resolved ${id} in project ${project.name}`);
}

export function pendingRemove(id: string, opts: PendingRemoveOpts): void {
  const crew = requireCrew(opts.crew);
  const located = findQuestion(crew, id, opts.project);
  if (!located) {
    print.error(`question not found: ${id}`);
    process.exit(1);
  }
  const { project, questions, index } = located;
  questions.splice(index, 1);
  writeQuestions(pendingFile(crew, project.name), project, questions);
  print.succeed(`removed ${id} from project ${project.name}`);
}

export function pendingFile(crew: CrewEntry, project: string): string {
  return rootPath(crew, path.join('Projects', project, 'Pending-Questions.md'));
}

function resolveTargets(crew: CrewEntry, projectName?: string): CrewProject[] {
  if (projectName) {
    const project = (crew.projects || []).find(p => p.name === projectName);
    if (!project) {
      print.error(`unknown project: ${projectName}`);
      process.exit(1);
    }
    return [project];
  }
  return crew.projects || [];
}

function resolveSingleProject(crew: CrewEntry, projectName: string | undefined, action: string): CrewProject {
  const name = projectName || autoProject(crew);
  if (!name) {
    print.error(`cannot determine project for "${action}". Use --project <name>.`);
    process.exit(1);
  }
  const project = (crew.projects || []).find(p => p.name === name);
  if (!project) {
    print.error(`unknown project: ${name}`);
    process.exit(1);
  }
  return project;
}

function autoProject(crew: CrewEntry): string | undefined {
  const cwd = process.cwd();
  const match = (crew.projects || []).find(p => isInside(cwd, p.path));
  return match?.name;
}

function findQuestion(
  crew: CrewEntry,
  id: string,
  projectName?: string,
): { project: CrewProject; questions: PendingQuestion[]; index: number } | undefined {
  const targets = resolveTargets(crew, projectName);
  for (const project of targets) {
    const file = pendingFile(crew, project.name);
    const questions = readQuestions(file);
    const index = questions.findIndex(q => q.id === id);
    if (index >= 0) return { project, questions, index };
  }
  return undefined;
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

const HEADER_LINE = '<!-- rig-crew-pending:v1 -->';
const OPEN_HEADING = '## Open';
const RESOLVED_HEADING = '## Resolved';

export function readQuestions(file: string): PendingQuestion[] {
  if (!fs.existsSync(file)) return [];
  const text = readText(file);
  const lines = text.split(/\r?\n/);
  const questions: PendingQuestion[] = [];
  let currentStatus: 'open' | 'resolved' = 'open';
  let buffer: string[] = [];
  let buffering = false;

  const flush = () => {
    if (!buffering) return;
    const parsed = parseQuestionBlock(buffer, currentStatus);
    if (parsed) questions.push(parsed);
    buffer = [];
    buffering = false;
  };

  for (const line of lines) {
    if (line.trim() === OPEN_HEADING) {
      flush();
      currentStatus = 'open';
      continue;
    }
    if (line.trim() === RESOLVED_HEADING) {
      flush();
      currentStatus = 'resolved';
      continue;
    }
    if (/^###\s+/.test(line)) {
      flush();
      buffering = true;
      buffer.push(line);
      continue;
    }
    if (buffering) buffer.push(line);
  }
  flush();
  return questions;
}

function parseQuestionBlock(lines: string[], status: 'open' | 'resolved'): PendingQuestion | undefined {
  if (lines.length === 0) return undefined;
  const heading = lines[0].replace(/^###\s+/, '').trim();
  const m = heading.match(/^([A-Z]+-\d{6}-\d{3})\s*[—-]?\s*(.*)$/);
  if (!m) return undefined;
  const id = m[1];
  let title = m[2].trim();
  const resolvedMark = title.match(/_\(resolved\s+(\d{4}-\d{2}-\d{2})\)_\s*$/);
  let resolved: string | undefined;
  if (resolvedMark) {
    resolved = resolvedMark[1];
    title = title.slice(0, resolvedMark.index).trim();
  }
  const question: PendingQuestion = {
    id,
    title,
    asked: '',
    status,
  };
  if (resolved) {
    question.status = 'resolved';
    question.resolved = resolved;
  }
  const extras: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const bullet = line.match(/^\s*-\s+([A-Za-z][A-Za-z ]+?):\s+(.*)$/);
    if (bullet) {
      const key = bullet[1].toLowerCase().replace(/\s+/g, '-');
      const value = bullet[2].trim();
      switch (key) {
        case 'asked':
          question.asked = value;
          break;
        case 'asked-by':
          question.askedBy = value;
          break;
        case 'priority':
          question.priority = value;
          break;
        case 'why-needed':
        case 'why':
          question.why = value;
          break;
        case 'what-to-provide':
        case 'need':
          question.need = value;
          break;
        case 'notes':
          question.notes = value;
          break;
        case 'resolved':
          question.resolved = value;
          question.status = 'resolved';
          break;
        case 'answer':
          question.answer = value;
          break;
        default:
          extras.push(line);
      }
    } else if (line.trim().length > 0) {
      extras.push(line);
    }
  }
  if (extras.length > 0) question.bodyExtras = extras.join('\n').trim();
  return question;
}

function writeQuestions(file: string, project: CrewProject, questions: PendingQuestion[]): void {
  const open = questions.filter(q => q.status === 'open');
  const resolved = questions.filter(q => q.status === 'resolved');
  const sections: string[] = [
    `# ${project.name} Pending Questions`,
    '',
    HEADER_LINE,
    '',
    'Materials / facts / decisions the user must supply before the crew can proceed.',
    'Add with `rig crew pending add "<title>" --project <name>`; resolve with `rig crew pending answer <id> --note "..."`.',
    '',
    OPEN_HEADING,
    '',
  ];
  if (open.length === 0) {
    sections.push('_No open questions._');
    sections.push('');
  } else {
    for (const q of open) sections.push(renderQuestion(q), '');
  }
  sections.push(RESOLVED_HEADING, '');
  if (resolved.length === 0) {
    sections.push('_No resolved questions yet._');
    sections.push('');
  } else {
    for (const q of resolved) sections.push(renderQuestion(q), '');
  }
  writeText(file, sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
}

function renderQuestion(q: PendingQuestion): string {
  const headingExtra = q.status === 'resolved' && q.resolved ? ` _(resolved ${q.resolved})_` : '';
  const lines: string[] = [`### ${q.id} — ${q.title}${headingExtra}`];
  if (q.asked) lines.push(`- Asked: ${q.asked}`);
  if (q.askedBy) lines.push(`- Asked by: ${q.askedBy}`);
  if (q.priority) lines.push(`- Priority: ${q.priority}`);
  if (q.why) lines.push(`- Why needed: ${q.why}`);
  if (q.need) lines.push(`- What to provide: ${q.need}`);
  if (q.notes) lines.push(`- Notes: ${q.notes}`);
  if (q.status === 'resolved') {
    if (q.resolved && !q.asked) lines.push(`- Resolved: ${q.resolved}`);
    if (q.answer) lines.push(`- Answer: ${q.answer}`);
  }
  if (q.bodyExtras) lines.push('', q.bodyExtras);
  return lines.join('\n');
}

function nextQuestionId(questions: PendingQuestion[]): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `Q-${yy}${mm}${dd}-`;
  let max = 0;
  for (const q of questions) {
    if (!q.id.startsWith(prefix)) continue;
    const suffix = parseInt(q.id.slice(prefix.length), 10);
    if (!Number.isNaN(suffix) && suffix > max) max = suffix;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
