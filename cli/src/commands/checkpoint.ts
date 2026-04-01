// cli/src/commands/checkpoint.ts
import chalk from 'chalk'
import type { CommandDefinition } from './types'

export const checkpointCommand: CommandDefinition = {
    name: 'checkpoint',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const subcommand = commandArgs[0]

        if (subcommand === 'list' || subcommand === 'ls') {
            const { runDockerCommand } = await import('@/cloud/docker/dockerCli')
            const result = await runDockerCommand([
                'images', '--filter', 'reference=haqi-checkpoint:*',
                '--format', '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}'
            ])
            const lines = result.stdout.trim().split('\n').filter(Boolean)
            if (lines.length === 0) {
                console.log(chalk.yellow('No checkpoints found on this machine.'))
                return
            }
            console.log(chalk.bold('Local checkpoints:\n'))
            for (const line of lines) {
                const [image, size, created] = line.split('\t')
                console.log(`  ${chalk.cyan(image?.padEnd(50))} ${(size ?? '').padEnd(12)} ${chalk.dim(created ?? '')}`)
            }
            return
        }

        if (subcommand === 'delete' || subcommand === 'rm') {
            const target = commandArgs[1]
            if (!target) {
                console.error(chalk.red('Usage: haqi checkpoint delete <checkpoint-id>'))
                process.exit(1)
            }
            const dockerImage = target.startsWith('haqi-checkpoint:') ? target : `haqi-checkpoint:${target}`
            const { runDockerCommand } = await import('@/cloud/docker/dockerCli')
            try {
                await runDockerCommand(['rmi', dockerImage])
                console.log(chalk.green(`Deleted: ${dockerImage}`))
            } catch (err) {
                console.error(chalk.red(`Failed: ${err instanceof Error ? err.message : err}`))
                process.exit(1)
            }
            return
        }

        console.log(`
${chalk.bold('haqi checkpoint')} - Manage environment checkpoints

${chalk.bold('Usage:')}
  haqi checkpoint list                List local checkpoint images
  haqi checkpoint list --repo <url>   Filter by repo (local only)
  haqi checkpoint delete <id>         Delete a checkpoint image
`)
    }
}
