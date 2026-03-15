import { access, readdir, readFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';

export interface SkillSummary {
    name: string;
    description?: string;
}

export interface ListSkillsRequest {
}

export interface ListSkillsResponse {
    success: boolean;
    skills?: SkillSummary[];
    error?: string;
}

function getHomeDirectory(): string {
    return process.env.HOME ?? process.env.USERPROFILE ?? homedir();
}

function getLegacyCodexSkillsRoot(): string {
    const codexHome = process.env.CODEX_HOME ?? join(getHomeDirectory(), '.codex');
    return join(codexHome, 'skills');
}

function getUserSkillsRoots(): string[] {
    const home = getHomeDirectory();
    return [
        join(home, '.agents', 'skills'),
        join(home, '.claude', 'skills'),
        getLegacyCodexSkillsRoot(),
    ];
}

function getAdminSkillsRoot(): string {
    return join('/etc', 'codex', 'skills');
}

function getProjectSkillsRoots(directory: string): string[] {
    return [
        join(directory, '.agents', 'skills'),
        join(directory, '.claude', 'skills'),
    ];
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function listProjectSkillsRoots(workingDirectory?: string): Promise<string[]> {
    if (!workingDirectory) {
        return [];
    }

    const resolvedWorkingDirectory = resolve(workingDirectory);
    const directories = [resolvedWorkingDirectory];
    let currentDirectory = resolvedWorkingDirectory;

    while (true) {
        if (await pathExists(join(currentDirectory, '.git'))) {
            return directories.flatMap(getProjectSkillsRoots);
        }

        const parentDirectory = dirname(currentDirectory);
        if (parentDirectory === currentDirectory) {
            return getProjectSkillsRoots(resolvedWorkingDirectory);
        }

        currentDirectory = parentDirectory;
        directories.push(currentDirectory);
    }
}

function parseFrontmatter(fileContent: string): { frontmatter?: Record<string, unknown>; body: string } {
    const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
        return { body: fileContent.trim() };
    }

    const yamlContent = match[1];
    const body = match[2].trim();
    try {
        const parsed = parseYaml(yamlContent) as Record<string, unknown> | null;
        return { frontmatter: parsed ?? undefined, body };
    } catch {
        return { body: fileContent.trim() };
    }
}

function extractSkillSummary(skillDir: string, fileContent: string): SkillSummary | null {
    const parsed = parseFrontmatter(fileContent);
    const nameFromFrontmatter = typeof parsed.frontmatter?.name === 'string' ? parsed.frontmatter.name.trim() : '';
    const name = nameFromFrontmatter || basename(skillDir);
    if (!name) {
        return null;
    }

    const description = typeof parsed.frontmatter?.description === 'string'
        ? parsed.frontmatter.description.trim()
        : undefined;

    return { name, description };
}

async function listTopLevelSkillDirs(skillsRoot: string): Promise<string[]> {
    try {
        const entries = await readdir(skillsRoot, { withFileTypes: true });
        const result: string[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }

            if (entry.name === '.system') {
                const systemRoot = join(skillsRoot, entry.name);
                const systemEntries = await readdir(systemRoot, { withFileTypes: true });
                for (const systemEntry of systemEntries) {
                    if (systemEntry.isDirectory()) {
                        result.push(join(systemRoot, systemEntry.name));
                    }
                }
                continue;
            }

            if (entry.name.startsWith('.')) {
                continue;
            }

            result.push(join(skillsRoot, entry.name));
        }

        return result;
    } catch {
        return [];
    }
}

async function readSkillSummaryFromDir(skillDir: string): Promise<SkillSummary | null> {
    const directFilePath = join(skillDir, 'SKILL.md');
    try {
        const directFileContent = await readFile(directFilePath, 'utf-8');
        return extractSkillSummary(skillDir, directFileContent);
    } catch {
        // ignore
    }

    try {
        const entries = await readdir(skillDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) {
                continue;
            }
            const nestedSkillDir = join(skillDir, entry.name);
            const nestedFilePath = join(nestedSkillDir, 'SKILL.md');
            try {
                await access(nestedFilePath);
                return {
                    name: basename(skillDir),
                    description: undefined,
                };
            } catch {
                // ignore
            }
        }
    } catch {
        // ignore
    }

    return null;
}

async function readSkillsFromDirs(skillDirs: string[]): Promise<SkillSummary[]> {
    const skills = await Promise.all(skillDirs.map(async (dir): Promise<SkillSummary | null> => {
        return await readSkillSummaryFromDir(dir);
    }));

    return skills.filter((skill): skill is SkillSummary => skill !== null);
}

export async function listSkills(workingDirectory?: string): Promise<SkillSummary[]> {
    const projectRoots = await listProjectSkillsRoots(workingDirectory);
    const [projectSkillDirs, userSkillDirs, adminSkillDirs] = await Promise.all([
        Promise.all(projectRoots.map(async (root) => await listTopLevelSkillDirs(root))).then((dirs) => dirs.flat()),
        Promise.all(getUserSkillsRoots().map(async (root) => await listTopLevelSkillDirs(root))).then((dirs) => dirs.flat()),
        listTopLevelSkillDirs(getAdminSkillsRoot()),
    ]);

    const [projectSkills, userSkills, adminSkills] = await Promise.all([
        readSkillsFromDirs(projectSkillDirs),
        readSkillsFromDirs(userSkillDirs),
        readSkillsFromDirs(adminSkillDirs),
    ]);

    const dedupedSkills = new Map<string, SkillSummary>();
    for (const skill of [
        ...projectSkills,
        ...userSkills,
        ...adminSkills,
    ]) {
        if (!dedupedSkills.has(skill.name)) {
            dedupedSkills.set(skill.name, skill);
        }
    }

    return [...dedupedSkills.values()].sort((a, b) => a.name.localeCompare(b.name));
}
