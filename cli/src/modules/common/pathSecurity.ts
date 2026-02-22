import { realpath } from 'fs/promises'
import { resolve, sep } from 'path'

export interface PathValidationResult {
    valid: boolean
    error?: string
}

/**
 * Validates that a path is within the allowed working directory
 * @param targetPath - The path to validate (can be relative or absolute)
 * @param workingDirectory - The session's working directory (must be absolute)
 * @returns Validation result
 */
function normalizePathForComparison(path: string): string {
    return process.platform === 'win32' ? path.toLowerCase() : path
}

function isPathWithinDirectory(targetPath: string, workingDirectory: string): boolean {
    const normalizedTarget = normalizePathForComparison(targetPath)
    const normalizedWorkingDir = normalizePathForComparison(workingDirectory)
    const workingDirPrefix = normalizedWorkingDir.endsWith(sep) ? normalizedWorkingDir : `${normalizedWorkingDir}${sep}`
    return normalizedTarget === normalizedWorkingDir || normalizedTarget.startsWith(workingDirPrefix)
}

export function validatePath(targetPath: string, workingDirectory: string): PathValidationResult {
    const resolvedTarget = resolve(workingDirectory, targetPath)
    const resolvedWorkingDir = resolve(workingDirectory)

    if (!isPathWithinDirectory(resolvedTarget, resolvedWorkingDir)) {
        return {
            valid: false,
            error: `Access denied: Path '${targetPath}' is outside the working directory`
        }
    }

    return { valid: true }
}

async function tryRealpath(path: string): Promise<string | null> {
    try {
        return await realpath(path)
    } catch {
        return null
    }
}

export async function resolveValidatedExistingPath(
    targetPath: string,
    workingDirectory: string,
    options?: { allowOutsideWorkingDirectory?: boolean }
): Promise<{
    valid: boolean
    resolvedPath?: string
    error?: string
    outsideWorkingDirectory?: boolean
}> {
    const allowOutsideWorkingDirectory = options?.allowOutsideWorkingDirectory === true
    const resolvedWorkingDir = resolve(workingDirectory)
    const resolvedTarget = resolve(workingDirectory, targetPath)
    const isOutsideByResolve = !isPathWithinDirectory(resolvedTarget, resolvedWorkingDir)

    if (!allowOutsideWorkingDirectory && isOutsideByResolve) {
        return {
            valid: false,
            error: `Access denied: Path '${targetPath}' is outside the working directory`,
            outsideWorkingDirectory: true
        }
    }

    const realTarget = await tryRealpath(resolvedTarget)
    if (!realTarget) {
        return { valid: false, error: `Path '${targetPath}' does not exist` }
    }

    const realWorkingDir = await tryRealpath(resolvedWorkingDir) ?? resolvedWorkingDir
    const isOutsideByRealpath = !isPathWithinDirectory(realTarget, realWorkingDir)

    if (!allowOutsideWorkingDirectory && isOutsideByRealpath) {
        return {
            valid: false,
            error: `Access denied: Path '${targetPath}' resolves outside the working directory`,
            outsideWorkingDirectory: true
        }
    }

    return {
        valid: true,
        resolvedPath: realTarget,
        outsideWorkingDirectory: isOutsideByRealpath
    }
}
