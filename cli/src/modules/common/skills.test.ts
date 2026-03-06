import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { listSkills } from './skills';

async function writeSkill(skillDir: string, name: string, description: string): Promise<void> {
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        '---',
        '',
        `# ${name}`,
    ].join('\n'));
}

describe('listSkills', () => {
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const originalCodexHome = process.env.CODEX_HOME;

    let sandboxDir: string;
    let homeDir: string;
    let codexHome: string;

    beforeEach(async () => {
        sandboxDir = await mkdtemp(join(tmpdir(), 'hapi-skills-'));
        homeDir = join(sandboxDir, 'home');
        codexHome = join(sandboxDir, 'codex-home');
        process.env.HOME = homeDir;
        process.env.USERPROFILE = homeDir;
        process.env.CODEX_HOME = codexHome;
        await mkdir(homeDir, { recursive: true });
    });

    afterEach(async () => {
        if (originalHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = originalHome;
        }

        if (originalUserProfile === undefined) {
            delete process.env.USERPROFILE;
        } else {
            process.env.USERPROFILE = originalUserProfile;
        }

        if (originalCodexHome === undefined) {
            delete process.env.CODEX_HOME;
        } else {
            process.env.HOME = originalHome
        }

        await rm(sandboxDir, { recursive: true, force: true });
    });

    it('returns empty list when skills directories are missing', async () => {
        await expect(listSkills()).resolves.toEqual([]);
    });

    it('lists top-level skills, legacy CODEX_HOME skills, and .system children', async () => {
        await writeSkill(join(codexHome, 'skills', 'amis'), 'amis', 'AMIS guide');
        await writeSkill(join(codexHome, 'skills', '.system', 'skill-creator'), 'skill-creator', 'Create skills');
        await writeSkill(join(codexHome, 'skills', 'hello-agents', 'analyze'), 'analyze', 'Nested sub skill');

        const skills = await listSkills();

        expect(skills.map((skill) => skill.name)).toEqual(['amis', 'hello-agents', 'skill-creator']);
    });

    it('lists user skills from ~/.claude/skills', async () => {
        await writeSkill(join(homeDir, '.claude', 'skills', 'claude-skill'), 'claude-skill', 'Claude skill');

        const skills = await listSkills();

        expect(skills.map((skill) => skill.name)).toEqual(['claude-skill']);
    });

    it('merges ~/.agents, ~/.claude, and legacy CODEX_HOME skills with stable precedence', async () => {
        await writeSkill(join(homeDir, '.agents', 'skills', 'shared'), 'shared', 'From agents');
        await writeSkill(join(homeDir, '.claude', 'skills', 'beta'), 'beta', 'From claude');
        await writeSkill(join(homeDir, '.claude', 'skills', 'shared'), 'shared', 'From claude');
        await writeSkill(join(codexHome, 'skills', 'shared'), 'shared', 'From codex home');

        const skills = await listSkills();

        expect(skills.map((skill) => skill.name)).toEqual(['beta', 'shared']);
        expect(skills.find((skill) => skill.name === 'shared')).toEqual({
            name: 'shared',
            description: 'From agents',
        });
    });

    it('falls back to directory name when frontmatter is missing', async () => {
        const skillDir = join(homeDir, '.agents', 'skills', 'no-frontmatter');
        await mkdir(skillDir, { recursive: true });
        await writeFile(join(skillDir, 'SKILL.md'), '# No Frontmatter\n');

        await expect(listSkills()).resolves.toEqual([
            { name: 'no-frontmatter', description: undefined },
        ]);
    });

    it('loads project skills from cwd up to repo root', async () => {
        const repoRoot = join(sandboxDir, 'repo');
        const packageDir = join(repoRoot, 'packages');
        const workingDirectory = join(packageDir, 'app');

        await mkdir(join(repoRoot, '.git'), { recursive: true });
        await writeSkill(join(repoRoot, '.agents', 'skills', 'root-skill'), 'root-skill', 'Repo root skill');
        await writeSkill(join(packageDir, '.agents', 'skills', 'package-skill'), 'package-skill', 'Package skill');
        await writeSkill(join(workingDirectory, '.agents', 'skills', 'local-skill'), 'local-skill', 'Local skill');
        await writeSkill(join(sandboxDir, '.agents', 'skills', 'outside-skill'), 'outside-skill', 'Outside repo skill');

        const skills = await listSkills(workingDirectory);

        expect(skills.map((skill) => skill.name)).toEqual(['local-skill', 'package-skill', 'root-skill']);
    });

    it('loads project skills from .claude/skills directories', async () => {
        const repoRoot = join(sandboxDir, 'repo');
        const workingDirectory = join(repoRoot, 'apps', 'web');

        await mkdir(join(repoRoot, '.git'), { recursive: true });
        await writeSkill(join(repoRoot, '.claude', 'skills', 'claude-root'), 'claude-root', 'Claude root skill');
        await writeSkill(join(workingDirectory, '.claude', 'skills', 'claude-local'), 'claude-local', 'Claude local skill');

        const skills = await listSkills(workingDirectory);

        expect(skills.map((skill) => skill.name)).toEqual(['claude-local', 'claude-root']);
    });

    it('prefers .agents project skills over .claude project skills with same name', async () => {
        const repoRoot = join(sandboxDir, 'repo');
        const workingDirectory = join(repoRoot, 'apps', 'web');

        await mkdir(join(repoRoot, '.git'), { recursive: true });
        await writeSkill(join(workingDirectory, '.agents', 'skills', 'shared'), 'shared', 'From agents');
        await writeSkill(join(workingDirectory, '.claude', 'skills', 'shared'), 'shared', 'From claude');

        const skills = await listSkills(workingDirectory);

        expect(skills).toHaveLength(1);
        expect(skills[0]).toEqual({ name: 'shared', description: 'From agents' });
    });

    it('uses only cwd project skills outside a git repository', async () => {
        const parentDirectory = join(sandboxDir, 'workspace');
        const workingDirectory = join(parentDirectory, 'feature');

        await writeSkill(join(parentDirectory, '.agents', 'skills', 'parent-skill'), 'parent-skill', 'Parent skill');
        await writeSkill(join(workingDirectory, '.agents', 'skills', 'local-skill'), 'local-skill', 'Local skill');

        const skills = await listSkills(workingDirectory);

        expect(skills.map((skill) => skill.name)).toEqual(['local-skill']);
    });

    it('prefers nearest project skill over parent and user duplicates', async () => {
        const repoRoot = join(sandboxDir, 'repo');
        const workingDirectory = join(repoRoot, 'apps', 'web');

        await mkdir(join(repoRoot, '.git'), { recursive: true });
        await writeSkill(join(homeDir, '.agents', 'skills', 'shared'), 'shared', 'User shared skill');
        await writeSkill(join(repoRoot, '.agents', 'skills', 'shared'), 'shared', 'Repo shared skill');
        await writeSkill(join(workingDirectory, '.agents', 'skills', 'shared'), 'shared', 'Local shared skill');

        const skills = await listSkills(workingDirectory);
        const sharedSkills = skills.filter((skill) => skill.name === 'shared');

        expect(sharedSkills).toHaveLength(1);
        expect(sharedSkills[0]).toEqual({
            name: 'shared',
            description: 'Local shared skill',
        });
    });
});
