export interface VoiceCommandMatch {
  matched: boolean;
  valid: boolean;
  userInput?: string;
  errorMessage?: string;
}

const VOICE_COMMAND_FORMAT = "语音命令格式：#语音 <内容> 或 @我 语音说 <内容>";

export function parseVoiceCommand(
  commandText: string,
  parsedMessageText: string,
  hasAtBot: boolean,
): VoiceCommandMatch {
  const normalizedCommand = normalize(commandText);
  const normalizedParsedText = normalize(parsedMessageText);

  const hashCommandMatch = normalizedCommand.match(/^#语音(?:\s+(.+))?$/u);
  if (hashCommandMatch) {
    const userInput = hashCommandMatch[1]?.trim() ?? "";
    return userInput
      ? {
          matched: true,
          valid: true,
          userInput,
        }
      : {
          matched: true,
          valid: false,
          errorMessage: VOICE_COMMAND_FORMAT,
        };
  }

  if (!hasAtBot) {
    return {
      matched: false,
      valid: false,
    };
  }

  const atCommandMatch = normalizedParsedText.match(/^语音说(?:[：:]\s*|\s+)?(.*)$/u);
  if (!atCommandMatch) {
    return {
      matched: false,
      valid: false,
    };
  }

  const userInput = atCommandMatch[1]?.trim() ?? "";
  return userInput
    ? {
        matched: true,
        valid: true,
        userInput,
      }
    : {
        matched: true,
        valid: false,
        errorMessage: VOICE_COMMAND_FORMAT,
      };
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
