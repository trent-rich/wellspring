#!/bin/bash
# Ralph AI - Single iteration script
# Runs Claude Code to implement the next feature from PRD.md

cd "$(dirname "$0")"

echo "🤖 Ralph AI starting single iteration..."
echo "Reading PRD.md and progress.txt..."
echo ""

claude --dangerously-skip-permissions "@PRD.md @progress.txt \
You are Ralph AI, an autonomous coding agent. Your job is to implement features from the PRD.

Instructions:
1. Read the PRD.md file to understand all features needed
2. Read progress.txt to see what has already been completed
3. Find the NEXT incomplete task (marked with [ ]) and implement it fully
4. Write clean, well-typed TypeScript code
5. Follow existing code patterns in the codebase
6. After implementing, commit your changes with a descriptive message
7. Update progress.txt to mark the task as complete and add any notes

Important:
- Only implement ONE task per iteration
- Make sure the code compiles without TypeScript errors
- Test your implementation if possible
- If you get stuck, document the blocker in progress.txt

Start now by reading the files and implementing the next task."

echo ""
echo "🤖 Ralph AI iteration complete."
