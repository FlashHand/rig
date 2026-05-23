import print from '../print';
import { requireVault } from './config';
import { qmdEmbed } from './qmd';

interface IndexOpts { force?: boolean; }

export default async function wikiIndex(opts: IndexOpts): Promise<void> {
  const t = requireVault();
  print.start(`qmd embed: ${t.name}`);
  const res = await qmdEmbed(t.name, t.path, { force: !!opts.force });
  if (res.ok) print.succeed(`qmd embed: ${t.name} done`);
  else {
    print.error(`qmd embed: ${t.name} failed: ${res.stderr.trim()}`);
    process.exit(1);
  }
}
