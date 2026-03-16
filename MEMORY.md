# MEMORY

## Claude runtime auth notes

Current Claude Code auth path: API via AWS Bedrock; not Claude subscription.

Relevant environment variables:

- `CLAUDE_CODE_USE_BEDROCK=1`  
  Enable Claude Code Bedrock mode.
- `AWS_PROFILE=claude-code`  
  AWS credential profile used by Claude Code.
- `AWS_REGION=us-west-2`  
  AWS region for Bedrock requests.
- `ANTHROPIC_MODEL=arn:aws:bedrock:...`  
  Bedrock model / inference profile ARN used as Claude model target.

Quick interpretation:

- `CLAUDE_CODE_USE_BEDROCK=1` + AWS vars present => Claude Code uses Bedrock API.
- This setup is API-based billing/credentials, not Anthropic subscription login.
