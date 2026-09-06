export const AGENT_COMMANDS = ["init", "run", "status", "doctor", "quarantine", "export"] as const;
export type AgentCommand = typeof AGENT_COMMANDS[number];

export function parseAgentCommand(argv: string[]): AgentCommand {
  const command = argv[0] as AgentCommand | undefined;
  if (!command || !AGENT_COMMANDS.includes(command)) throw new Error(`Usage: myqsl-agent ${AGENT_COMMANDS.join("|")}`);
  return command;
}
