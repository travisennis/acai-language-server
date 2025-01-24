import {
  type CancellationToken,
  type CodeAction,
  CodeActionKind,
  type CodeActionParams,
  type CompletionItem,
  type CompletionParams,
  type Diagnostic,
  // DiagnosticSeverity,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  type WorkDoneProgressReporter,
  createConnection,
} from "vscode-languageserver/node.js";

import { type Range, TextDocument } from "vscode-languageserver-textdocument";

import { generateText } from "ai";

import path from "node:path";
import { parseContext } from "./embeddingInstructions.ts";
import log from "./log.ts";

import {
  type ModelName,
  languageModel,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";
import envPaths from "@travisennis/stdlib/env";

export function createTextDocuments() {
  // Create a text document manager
  const documents: TextDocuments<TextDocument> = new TextDocuments(
    TextDocument,
  );
  return documents;
}

export function initConnection(documents: TextDocuments<TextDocument>) {
  // Create a connection for the server
  const connection = createConnection(
    ProposedFeatures.all,
    process.stdin,
    process.stdout,
  );

  connection.onInitialize((_params: InitializeParams) => {
    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { resolveProvider: true },
        // Enable code actions
        codeActionProvider: {
          codeActionKinds: [CodeActionKind.QuickFix],
          resolveProvider: true,
        },
      },
    };
    return result;
  });

  connection.onCompletion(
    async (
      params: CompletionParams,
      _token: CancellationToken,
      workDoneProgress: WorkDoneProgressReporter,
    ): Promise<CompletionItem[]> => {
      const document = documents.get(params.textDocument.uri);
      if (!document) return [];

      const position = params.position;
      const text = document.getText();

      // Get the current line up to the cursor position
      const lines = text.split("\n");
      const currentLine = lines[position.line];
      const linePrefix = currentLine.slice(0, position.character);

      // Get some context before the cursor (previous few lines)
      const contextLines = lines.slice(
        Math.max(0, position.line - 5),
        position.line,
      );
      const context = [...contextLines, linePrefix].join("\n");

      try {
        workDoneProgress.begin("Generating completions...");

        const stateDir = envPaths("acai").state;
        const MESSAGES_FILE_PATH = path.join(
          stateDir,
          "completion-messages.jsonl",
        );

        const langModel = wrapLanguageModel(
          languageModel("anthropic:haiku"),
          auditMessage({ path: MESSAGES_FILE_PATH }),
        );

        const { text: completionText } = await generateText({
          model: langModel,
          system:
            'You are a code completion assistant. Based on the code context provided, suggest relevant code completions. Return a JSON array of completion items, where each item has "label" (what shows in the completion list) and "detail" (full completion text). Keep suggestions concise and relevant.',
          temperature: 0.3,
          prompt: `Given this code context, provide relevant code completions:\n\n${context}`,
        });

        let completions: Array<{ label: string; detail: string }> = [];
        try {
          completions = JSON.parse(extractCode(completionText));
        } catch (e) {
          log.write(
            `Failed to parse completion response: ${(e as Error).message}`,
          );
          return [];
        }

        return completions.map((item, index) => ({
          label: item.label,
          kind: 15, // Snippet
          detail: item.detail,
          sortText: String(index).padStart(5, "0"),
          insertText: item.detail,
          data: {
            // Store data for resolve
            uri: params.textDocument.uri,
            detail: item.detail,
          },
        }));
      } catch (error) {
        log.write(`Error generating completions: ${(error as Error).message}`);
        return [];
      } finally {
        workDoneProgress.done();
      }
    },
  );

  connection.onCompletionResolve(
    async (item: CompletionItem): Promise<CompletionItem> => {
      // If we already have detailed information, return as is
      if (item.documentation) return item;

      try {
        if (item.data?.uri && item.data?.detail) {
          const stateDir = envPaths("acai").state;
          const MESSAGES_FILE_PATH = path.join(
            stateDir,
            "completion-messages.jsonl",
          );

          const langModel = wrapLanguageModel(
            languageModel("anthropic:haiku"),
            auditMessage({ path: MESSAGES_FILE_PATH }),
          );

          const { text: documentation } = await generateText({
            model: langModel,
            system:
              "You are a code documentation assistant. Provide a brief, clear explanation of the code completion suggestion.",
            temperature: 0.3,
            prompt: `Explain this code completion suggestion briefly:\n\n${item.data.detail}`,
          });

          item.documentation = {
            kind: "markdown",
            value: documentation.trim(),
          };
        }
      } catch (error) {
        log.write(`Error resolving completion: ${(error as Error).message}`);
      }

      return item;
    },
  );

  // Register code action handler
  connection.onCodeAction((params: CodeActionParams): CodeAction[] => {
    const textDocument = documents.get(params.textDocument.uri);
    if (!textDocument) return [];

    const codeActions: CodeAction[] = [];

    const range = params.range;

    // Create the Instruct code action
    const instructAction: CodeAction = {
      title: "Acai - Instruct",
      kind: CodeActionKind.QuickFix,
      data: {
        id: "ai.instruct",
        documentUri: params.textDocument.uri,
        range,
        diagnostics: params.context.diagnostics,
      },
      isPreferred: true,
    };

    codeActions.push(instructAction);
    return codeActions;
  });

  connection.onCodeActionResolve(async (params) => {
    if (params.data?.documentUri && params.data?.range) {
      const stateDir = envPaths("acai").state;
      const MESSAGES_FILE_PATH = path.join(
        stateDir,
        "completion-messages.jsonl",
      );

      const textDocument = documents.get(params.data.documentUri);
      if (!textDocument) return params;

      // Get the text from the range where the code action was triggered
      const range = params.data.range as Range;
      const documentText = textDocument.getText(range);

      log.write(documentText);

      const context = parseContext(documentText);

      log.write(context);

      const langModel = wrapLanguageModel(
        languageModel((context.model ?? "anthropic:sonnet") as ModelName),
        auditMessage({ path: MESSAGES_FILE_PATH }),
      );

      const userPrompt = `
\`\`\`
${context.context}
\`\`\`

${context.prompt ?? ""}
    `.trim();

      try {
        const { text } = await generateText({
          model: langModel,
          system:
            "You are a highly skilled coding assistant and senior software engineer. Your task is to provide concise, accurate, and efficient solutions to the user's coding requests. Focus on best practices, code optimization, and maintainability in your solutions. Please respond with only the revised code. If your response is a new addition to the code, then return your additions along with the original code. Only return the code. Do not wrap the code in Markdown code blocks. Ensure your answer is in plain text without any Markdown formatting. ",
          temperature: context.temperature ?? 0.3,
          prompt: userPrompt,
        });

        params.edit = {
          changes: {
            [params.data.documentUri]: [
              TextEdit.replace(range, extractCode(text)),
            ],
          },
        };
      } catch (error) {
        log.write("Error generating text:");
        log.write(error);
        // Optionally, you can set an error message on the code action
        params.diagnostics = [
          {
            range: range,
            message: "Failed to generate text. Please try again.",
          },
        ];
      }
    }
    return params;
  });

  // Register diagnostic handler
  connection.onDidChangeTextDocument((params) => {
    const textDocument = documents.get(params.textDocument.uri);
    if (textDocument) {
      validateTextDocument(textDocument);
    }
  });

  function validateTextDocument(textDocument: TextDocument): void {
    // const text = textDocument.getText();
    const diagnostics: Diagnostic[] = [];

    // Add diagnostics where the Instruct code action might be helpful
    // For this example, we'll look for function declarations
    // const functionRegex = /function\s+(\w+)/g;
    // let match;

    // while ((match = functionRegex.exec(text)) !== null) {
    //   const diagnostic: Diagnostic = {
    //     severity: DiagnosticSeverity.Information,
    //     range: {
    //       start: textDocument.positionAt(match.index),
    //       end: textDocument.positionAt(match.index + match[0].length),
    //     },
    //     message: `Consider adding instructions for function '${match[1]}'`,
    //     source: "Instruct LSP",
    //   };

    //   diagnostics.push(diagnostic);
    // }

    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
  }

  return connection;
}

const MD_CODE_BLOCK = /```(?:[\w-]+)?\n(.*?)```/s;

export const extractCode = (text: string): string => {
  const pattern = MD_CODE_BLOCK;
  const match = text.match(pattern);
  if (match) {
    return match[1].trim();
  }
  return text;
};
