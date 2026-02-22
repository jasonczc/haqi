import { mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, it, expect } from 'vitest';
import { resolveValidatedExistingPath, validatePath } from './pathSecurity';

describe('validatePath', () => {
    const workingDir = '/home/user/project';

    it('should allow paths within working directory', () => {
        expect(validatePath('/home/user/project/file.txt', workingDir).valid).toBe(true);
        expect(validatePath('file.txt', workingDir).valid).toBe(true);
        expect(validatePath('./src/file.txt', workingDir).valid).toBe(true);
    });

    it('should reject paths outside working directory', () => {
        const result = validatePath('/etc/passwd', workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should prevent path traversal attacks', () => {
        const result = validatePath('../../.ssh/id_rsa', workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should correctly handle working directory at filesystem root', () => {
        const rootDir = '/'
        expect(validatePath('/etc/passwd', rootDir).valid).toBe(true);
        expect(validatePath('etc/passwd', rootDir).valid).toBe(true);
    });

    it('should not treat sibling directories as inside working directory', () => {
        const result = validatePath('/home/user/project2/file.txt', workingDir);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('outside the working directory');
    });

    it('should allow the working directory itself', () => {
        expect(validatePath('.', workingDir).valid).toBe(true);
        expect(validatePath(workingDir, workingDir).valid).toBe(true);
    });
});

describe('resolveValidatedExistingPath', () => {
    it('supports bounded and YOLO-style outside access with symlink protection', async () => {
        const workspace = await mkdtemp(join(tmpdir(), 'hapi-path-security-'));
        const workingDir = join(workspace, 'project');
        const outsideDir = join(workspace, 'outside');
        await mkdir(workingDir, { recursive: true });
        await mkdir(outsideDir, { recursive: true });

        const safeFile = join(workingDir, 'safe.txt');
        const outsideFile = join(outsideDir, 'outside.txt');
        await writeFile(safeFile, 'safe');
        await writeFile(outsideFile, 'outside');

        try {
            const inside = await resolveValidatedExistingPath('safe.txt', workingDir);
            expect(inside.valid).toBe(true);
            expect(inside.outsideWorkingDirectory).toBe(false);

            const parentTraversalDenied = await resolveValidatedExistingPath('../outside/outside.txt', workingDir);
            expect(parentTraversalDenied.valid).toBe(false);

            const parentTraversalAllowed = await resolveValidatedExistingPath('../outside/outside.txt', workingDir, {
                allowOutsideWorkingDirectory: true
            });
            expect(parentTraversalAllowed.valid).toBe(true);
            expect(parentTraversalAllowed.outsideWorkingDirectory).toBe(true);

            if (process.platform !== 'win32') {
                const symlinkPath = join(workingDir, 'outside-link.txt');
                await symlink(outsideFile, symlinkPath);

                const symlinkDenied = await resolveValidatedExistingPath('outside-link.txt', workingDir);
                expect(symlinkDenied.valid).toBe(false);

                const symlinkAllowed = await resolveValidatedExistingPath('outside-link.txt', workingDir, {
                    allowOutsideWorkingDirectory: true
                });
                expect(symlinkAllowed.valid).toBe(true);
                expect(symlinkAllowed.outsideWorkingDirectory).toBe(true);
            }
        } finally {
            await rm(workspace, { recursive: true, force: true });
        }
    });
});
