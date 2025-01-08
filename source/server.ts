import {
  type CodeAction,
  CodeActionKind,
  type CodeActionParams,
  type Diagnostic,
  // DiagnosticSeverity,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  createConnection,
} from "vscode-languageserver/node.js";

import { type Range, TextDocument } from "vscode-languageserver-textdocument";

import { generateText } from "ai";

import path from "node:path";
import { parseContext } from "./embeddingInstructions.ts";
import log from "./log.ts";

import envPaths from "@travisennis/stdlib/env";
import {
  languageModel,
  type ModelName,
  wrapLanguageModel,
} from "@travisennis/acai-core";
import { auditMessage } from "@travisennis/acai-core/middleware";

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
        // Enable code actions
        codeActionProvider: {
          codeActionKinds: [CodeActionKind.QuickFix],
          resolveProvider: true,
        },
      },
    };
    return result;
  });

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
      const MESSAGES_FILE_PATH = path.join(stateDir, "messages.jsonl");

      const textDocument = documents.get(params.data.documentUri);
      if (!textDocument) return params;

      // Get the text from the range where the code action was triggered
      const range = params.data.range as Range;
      const documentText = textDocument.getText(range);

      const context = parseContext(documentText);

      const langModel = wrapLanguageModel(
        languageModel((context.model ?? "anthropic:sonnet") as ModelName),
        auditMessage({ path: MESSAGES_FILE_PATH }),
      );

      const userPrompt = `
\`\`\`
${context.context}
\`\`\`

${context.prompt}
    `.trim();

      try {
        const { text } = await generateText({
          model: langModel,
          system:
            "You are a highly skilled coding assistant and senior software engineer. Your task is to provide concise, accurate, and efficient solutions to the user's coding requests. Please respond with only the revised code. If your response is a new addition to the code, then return your additions along with the original code. Only return the code. Ensure your answer is in plain text without any Markdown formatting. Focus on best practices, code optimization, and maintainability in your solutions.",
          temperature: context.temperature ?? 0.3,
          prompt: userPrompt,
        });

        params.edit = {
          changes: {
            [params.data.documentUri]: [TextEdit.replace(range, text)],
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
