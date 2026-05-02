import { describe, expect, it } from 'vitest'
import { classifyBashCommand, splitBashSegments } from './bashClassify'

describe('splitBashSegments', () => {
    it('splits on top-level pipes, &&, ||, ; and newlines', () => {
        expect(splitBashSegments('cat a | grep foo && ls')).toEqual(['cat a', 'grep foo', 'ls'])
        expect(splitBashSegments('cat a; ls; tree')).toEqual(['cat a', 'ls', 'tree'])
        expect(splitBashSegments('foo || bar')).toEqual(['foo', 'bar'])
    })

    it('drops redirect targets (`> file`, `>> file`, `2>&1`, `< file`)', () => {
        expect(splitBashSegments('cat a > out.txt')).toEqual(['cat a'])
        expect(splitBashSegments('grep foo bar.log >> out.log')).toEqual(['grep foo bar.log'])
        expect(splitBashSegments('cat < input.txt')).toEqual(['cat'])
    })

    it('keeps quoted operators inside the segment', () => {
        expect(splitBashSegments('grep "a | b" file')).toEqual(['grep "a | b" file'])
        expect(splitBashSegments(`grep 'a;b' file`)).toEqual([`grep 'a;b' file`])
    })

    it('respects backslash escapes outside quotes', () => {
        expect(splitBashSegments('echo a\\;b')).toEqual(['echo a\\;b'])
    })
})

describe('classifyBashCommand', () => {
    it('classifies pure read commands', () => {
        expect(classifyBashCommand('cat foo.txt')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('head -n 10 foo')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('wc -l *.ts')).toEqual({ isSearch: false, isRead: true, isList: false })
    })

    it('classifies pure search commands', () => {
        expect(classifyBashCommand('grep -rn foo .')).toEqual({ isSearch: true, isRead: false, isList: false })
        expect(classifyBashCommand('rg --type ts pattern')).toEqual({ isSearch: true, isRead: false, isList: false })
        expect(classifyBashCommand('find . -name "*.tsx"')).toEqual({ isSearch: true, isRead: false, isList: false })
    })

    it('classifies pure list commands', () => {
        expect(classifyBashCommand('ls -la')).toEqual({ isSearch: false, isRead: false, isList: true })
        expect(classifyBashCommand('tree src')).toEqual({ isSearch: false, isRead: false, isList: true })
    })

    it('marks any non-search/read/list segment as not collapsible', () => {
        expect(classifyBashCommand('git push')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('npm install')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('rm -rf node_modules')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('cd web')).toEqual({ isSearch: false, isRead: false, isList: false })
    })

    it('rejects mixed pipelines that contain a destructive segment', () => {
        // cat is read, but rm is destructive — whole line should be rejected.
        expect(classifyBashCommand('cat foo && rm bar')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('grep foo file | tee output')).toEqual({ isSearch: false, isRead: false, isList: false })
    })

    it('treats neutral commands (echo/printf/true) as transparent', () => {
        expect(classifyBashCommand('ls && echo "---" && ls dir2')).toEqual({ isSearch: false, isRead: false, isList: true })
        expect(classifyBashCommand('echo only')).toEqual({ isSearch: false, isRead: false, isList: false })
    })

    it('combines categories across segments', () => {
        expect(classifyBashCommand('grep foo file | wc -l')).toEqual({ isSearch: true, isRead: true, isList: false })
        expect(classifyBashCommand('ls && cat foo')).toEqual({ isSearch: false, isRead: true, isList: true })
    })

    it('skips leading env-var assignments when picking the base command', () => {
        expect(classifyBashCommand('LANG=C grep foo file')).toEqual({ isSearch: true, isRead: false, isList: false })
    })

    it('returns not-collapsible for empty / whitespace-only commands', () => {
        expect(classifyBashCommand('')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('   ')).toEqual({ isSearch: false, isRead: false, isList: false })
    })

    it('classifies read-only git subcommands as read', () => {
        expect(classifyBashCommand('git status --short')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git log --oneline -10')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git diff -- web/src')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git show HEAD')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git blame README.md')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git rev-parse HEAD')).toEqual({ isSearch: false, isRead: true, isList: false })
    })

    it('handles git pre-subcommand flags (`git -C path log`, `git --no-pager diff`)', () => {
        expect(classifyBashCommand('git -C /tmp/repo log')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('git --no-pager diff')).toEqual({ isSearch: false, isRead: true, isList: false })
        expect(classifyBashCommand('LANG=C git log')).toEqual({ isSearch: false, isRead: true, isList: false })
    })

    it('refuses to merge mutating git subcommands', () => {
        expect(classifyBashCommand('git push')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('git commit -m "msg"')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('git add file')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('git checkout main')).toEqual({ isSearch: false, isRead: false, isList: false })
        expect(classifyBashCommand('git reset --hard')).toEqual({ isSearch: false, isRead: false, isList: false })
    })

    it('mixes git reads with other read/search/list commands in a pipeline', () => {
        expect(classifyBashCommand('git log | grep fix')).toEqual({ isSearch: true, isRead: true, isList: false })
        expect(classifyBashCommand('git status && ls')).toEqual({ isSearch: false, isRead: true, isList: true })
    })
})
