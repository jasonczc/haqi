// cli/src/commands/workspace.ts
import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const workspaceCommand: CommandDefinition = {
    name: 'workspace',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'list' || subcommand === 'ls') {
            const { listHaqiContainers } = await import('@/cloud/docker/containerManager')
            const containers = await listHaqiContainers()
            if (containers.length === 0) {
                console.log(chalk.yellow('No workspace containers found.'))
                return
            }
            console.log(chalk.bold('Workspace containers:\n'))
            for (const c of containers) {
                const statusColor = c.status.includes('Up') ? chalk.green : chalk.red
                console.log(`  ${chalk.cyan(c.id.slice(0, 12))}  ${c.name.padEnd(45)} ${statusColor(c.status.padEnd(20))} ${chalk.dim(c.runtime)}`)
                if (c.workspaceId) console.log(`${' '.repeat(16)}workspace: ${chalk.dim(c.workspaceId)}`)
            }
            return
        }

        if (subcommand === 'stop-session') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace stop-session <container-id>'))
                process.exit(1)
            }
            const { stopSessionInContainer } = await import('@/cloud/docker/containerManager')
            await stopSessionInContainer(target)
            console.log(chalk.green(`Session stopped in ${target}`))
            return
        }

        if (subcommand === 'stop') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace stop <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            await new DockerCliRuntime().stop(target)
            console.log(chalk.green(`Stopped: ${target}`))
            return
        }

        if (subcommand === 'rm' || subcommand === 'remove') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace rm <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            const runtime = new DockerCliRuntime()
            await runtime.stop(target).catch(() => {})
            await runtime.remove(target)
            console.log(chalk.green(`Removed: ${target}`))
            return
        }

        if (subcommand === 'clean') {
            const { cleanStoppedContainers } = await import('@/cloud/docker/containerManager')
            const removed = await cleanStoppedContainers()
            if (removed.length === 0) {
                console.log(chalk.yellow('No stopped containers to clean.'))
            } else {
                for (const id of removed) console.log(chalk.green(`Removed: ${id}`))
                console.log(chalk.green(`Cleaned ${removed.length} container(s).`))
            }
            return
        }

        if (subcommand === 'logs') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi workspace logs <container-id>'))
                process.exit(1)
            }
            const { DockerCliRuntime } = await import('@/cloud/docker/dockerCli')
            console.log(await new DockerCliRuntime().logs(target, 200))
            return
        }

        console.log(`
${chalk.bold('haqi workspace')} - Manage workspace containers

${chalk.bold('Usage:')}
  haqi workspace list              List all workspace containers
  haqi workspace stop-session <id> Stop agent session (container stays alive)
  haqi workspace stop <id>         Stop container (docker stop)
  haqi workspace rm <id>           Remove container (docker rm)
  haqi workspace clean             Remove all stopped containers
  haqi workspace logs <id>         Show container logs
`)
    }
}
