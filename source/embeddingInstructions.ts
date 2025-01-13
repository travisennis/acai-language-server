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
    const tl = line.trim();
    if (tl.startsWith(MODEL_INSTRUCTION)) {
      model = tl.replace(MODEL_INSTRUCTION, "").trim();
    } else if (tl.startsWith(TEMPERATURE_INSTRUCTION)) {
      temperature =
        Number.parseFloat(tl.replace(TEMPERATURE_INSTRUCTION, "").trim()) ||
        null;
    } else if (tl.startsWith(PROMPT_INSTRUCTION)) {
      prompt = tl.replace(PROMPT_INSTRUCTION, "").trim();
    } else if (tl.startsWith(SHORT_PROMPT_INSTRUCTION)) {
      prompt = tl.replace(SHORT_PROMPT_INSTRUCTION, "").trim();
    } else {
      context.push(line);
    }
  }

  return {
    model,
    temperature,
    prompt,
    context: context.join("\n"),
  };
}
