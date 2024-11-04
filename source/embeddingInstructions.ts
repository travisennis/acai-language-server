const MODEL_INSTRUCTION = "// model:";
const TEMPERATURE_INSTRUCTION = "// temperature:";
const PROMPT_INSTRUCTION = "// prompt:";
const SHORT_PROMPT_INSTRUCTION = "//%";

interface EmbeddedInstructions {
  model: string | null;
  temperature: number | null;
  prompt: string | null;
  context: string;
}

/**
 * Parses the input string to extract embedded instructions and context.
 *
 * This function processes the input string line by line, looking for specific
 * instruction prefixes to populate the `EmbeddedInstructions` interface fields.
 * Lines that don't match any instruction prefix are considered part of the context.
 *
 * @param input - A string containing the input text to parse.
 * @returns An `EmbeddedInstructions` object with parsed values and remaining context.
 *
 * @example
 * const input = `model: gpt-3.5-turbo
 * temperature: 0.7
 * prompt: Instructions for LLM
 * Some context here
 * More context`;
 * const result = parseContext(input);
 * console.log(result.model); // 'gpt-3.5-turbo'
 * console.log(result.temperature); // 0.7
 * console.log(result.prompt); // 'Instructions for LLM'
 * console.log(result.context); // 'Some context here\nMore context'
 */
export function parseContext(input: string): EmbeddedInstructions {
  let model: string | null = null;
  let temperature: number | null = null;
  let prompt: string | null = null;
  const context: string[] = [];

  const lines = input.split("\n");
  for (const line of lines) {
    if (line.startsWith(MODEL_INSTRUCTION)) {
      model = line.replace(MODEL_INSTRUCTION, "").trim();
    } else if (line.startsWith(TEMPERATURE_INSTRUCTION)) {
      temperature =
        Number.parseFloat(line.replace(TEMPERATURE_INSTRUCTION, "").trim()) ||
        null;
    } else if (line.startsWith(PROMPT_INSTRUCTION)) {
      prompt = line.replace(PROMPT_INSTRUCTION, "").trim();
    } else if (line.startsWith(SHORT_PROMPT_INSTRUCTION)) {
      prompt = line.replace(SHORT_PROMPT_INSTRUCTION, "").trim();
    } else {
      context.push(line.trim());
    }
  }

  return {
    model,
    temperature,
    prompt,
    context: context.join("\n"),
  };
}
