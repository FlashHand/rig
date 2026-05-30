import { detectHostEngine, resolveEngine, isEngine } from './engine';

describe('isEngine', () => {
  it('accepts the three valid engines', () => {
    expect(isEngine('claude')).toBe(true);
    expect(isEngine('codex')).toBe(true);
    expect(isEngine('pi')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isEngine('gpt')).toBe(false);
    expect(isEngine('')).toBe(false);
    expect(isEngine(undefined)).toBe(false);
  });
});

describe('detectHostEngine', () => {
  it('detects claude from CLAUDECODE', () => {
    expect(detectHostEngine({ CLAUDECODE: '1' })).toBe('claude');
  });
  it('detects claude from CLAUDE_CODE_* and AI_AGENT', () => {
    expect(detectHostEngine({ CLAUDE_CODE_ENTRYPOINT: 'cli' })).toBe('claude');
    expect(detectHostEngine({ AI_AGENT: 'claude-code' })).toBe('claude');
  });
  it('detects codex from CODEX_* / AI_AGENT', () => {
    expect(detectHostEngine({ CODEX_SANDBOX: '1' })).toBe('codex');
    expect(detectHostEngine({ AI_AGENT: 'codex' })).toBe('codex');
  });
  it('returns null when neither present', () => {
    expect(detectHostEngine({ PATH: '/usr/bin' })).toBeNull();
  });
  it('returns null when ambiguous (both)', () => {
    expect(detectHostEngine({ CLAUDECODE: '1', CODEX_SANDBOX: '1' })).toBeNull();
  });
});

describe('resolveEngine — 5-level order (design §2.2)', () => {
  const noHost = { PATH: '/usr/bin' };

  it('1. explicit wins over everything', () => {
    const r = resolveEngine({ explicit: 'codex', project: { defaultExecutor: 'claude' }, crew: { defaultExecutor: 'claude' }, env: { CLAUDECODE: '1' } });
    expect(r).toEqual({ engine: 'codex', source: 'explicit' });
  });

  it('throws on invalid explicit engine', () => {
    expect(() => resolveEngine({ explicit: 'gpt' })).toThrow(/invalid engine/);
  });

  it('2. project default beats crew + host', () => {
    const r = resolveEngine({ project: { defaultExecutor: 'codex' }, crew: { defaultExecutor: 'claude' }, env: { CLAUDECODE: '1' } });
    expect(r).toEqual({ engine: 'codex', source: 'project' });
  });

  it('3. crew default beats host', () => {
    const r = resolveEngine({ crew: { defaultExecutor: 'codex' }, env: { CLAUDECODE: '1' } });
    expect(r).toEqual({ engine: 'codex', source: 'crew' });
  });

  it('4. host self-detect when no config default', () => {
    const r = resolveEngine({ crew: { defaultExecutor: undefined }, env: { CLAUDECODE: '1' } });
    expect(r).toEqual({ engine: 'claude', source: 'host' });
  });

  it('5. unresolved when nothing resolves', () => {
    const r = resolveEngine({ env: noHost });
    expect(r.engine).toBeNull();
    expect(r.source).toBe('unresolved');
  });

  it('skips invalid config values (treated as unset), falls through to host', () => {
    const r = resolveEngine({ project: { defaultExecutor: 'bogus' }, crew: { defaultExecutor: 'also-bad' }, env: { CODEX_SANDBOX: '1' } });
    expect(r).toEqual({ engine: 'codex', source: 'host' });
  });
});
