import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError, UsageError } from './errors.js';

export const skillAgents = ['codex', 'opencode', 'general'] as const;
export type SkillAgent = typeof skillAgents[number];
export type SkillScope = 'project' | 'user';

export function runningFromNpxCache(): boolean {
  return (process.argv[1] ?? '').split(/[\\/]/).includes('_npx');
}

export function installGlobalCli(version: string): void {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new CliError('CONFIG_ERROR', 'npm executable path is unavailable for global CLI installation.');
  const result = spawnSync(process.execPath, [npmCli, 'install', '--global', `openyapi-cli@${version}`], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new CliError('CONFIG_ERROR', 'Global CLI installation failed; no skill was installed.');
  }
}

const agentDirectories: Record<SkillAgent, string> = {
  codex: '.codex',
  opencode: '.opencode',
  general: '.agents',
};

const source = fileURLToPath(new URL('../.agents/skills/openyapi/SKILL.md', import.meta.url));

export function installSkill(options: {
  agent: SkillAgent;
  scope: SkillScope;
  projectDir?: string;
  force?: boolean;
}): { agent: SkillAgent; scope: SkillScope; path: string; status: 'installed' | 'unchanged' | 'replaced' } {
  const destination = skillDestination(options);
  const parent = dirname(destination);
  const existing = existingSkill(destination, options.force ?? false);
  if (existing?.equals(readFileSync(source))) {
    return { agent: options.agent, scope: options.scope, path: destination, status: 'unchanged' };
  }
  try {
    mkdirSync(parent, { recursive: true });
    if (existing === undefined) {
      copyFileSync(source, destination);
    } else {
      const temporary = join(parent, `.SKILL.md-${process.pid}.tmp`);
      try {
        copyFileSync(source, temporary);
        renameSync(temporary, destination);
      } finally {
        rmSync(temporary, { force: true });
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new CliError('CONFIG_ERROR', `Unable to install skill at ${destination}: ${reason}`);
  }
  return { agent: options.agent, scope: options.scope, path: destination, status: existing === undefined ? 'installed' : 'replaced' };
}

function skillDestination(options: { agent: SkillAgent; scope: SkillScope; projectDir?: string }): string {
  if (options.scope === 'user' && options.projectDir !== undefined) {
    throw new UsageError('--project-dir requires --scope project.');
  }
  const base = options.scope === 'user' ? homedir() : resolve(options.projectDir ?? process.cwd());
  if (options.scope === 'project' && (!existsSync(base) || !lstatSync(base).isDirectory())) {
    throw new UsageError(`Project directory does not exist: ${base}`);
  }
  return options.scope === 'user' && options.agent === 'opencode'
    ? join(base, '.config', 'opencode', 'skills', 'openyapi', 'SKILL.md')
    : join(base, agentDirectories[options.agent], 'skills', 'openyapi', 'SKILL.md');
}

function existingSkill(destination: string, force: boolean): Buffer | undefined {
  if (existsSync(destination)) {
    if (!lstatSync(destination).isFile()) {
      throw new CliError('CONFIG_ERROR', `Skill target is not a regular file: ${destination}`);
    }
    const existing = readFileSync(destination);
    if (!existing.equals(readFileSync(source)) && !force) {
      throw new CliError('CONFIG_ERROR', `Skill already exists with different content: ${destination}. Use --force to replace it.`);
    }
    return existing;
  }
  return undefined;
}

export function installSkills(options: {
  agents: SkillAgent[];
  scope: SkillScope;
  projectDir?: string;
  force?: boolean;
}): { scope: SkillScope; results: ReturnType<typeof installSkill>[] } {
  preflightSkills(options);
  const results = options.agents.map((agent) => installSkill({
    agent,
    scope: options.scope,
    ...(options.projectDir === undefined ? {} : { projectDir: options.projectDir }),
    force: options.force ?? false,
  }));
  return { scope: options.scope, results };
}

export function preflightSkills(options: {
  agents: SkillAgent[];
  scope: SkillScope;
  projectDir?: string;
  force?: boolean;
}): void {
  if (options.agents.length === 0) throw new UsageError('Select at least one agent.');
  for (const agent of options.agents) {
    const destination = skillDestination({
      agent,
      scope: options.scope,
      ...(options.projectDir === undefined ? {} : { projectDir: options.projectDir }),
    });
    existingSkill(destination, options.force ?? false);
  }
}
