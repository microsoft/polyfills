import type { AtRule, Declaration } from "postcss";
import type { Diagnostic } from "../diagnostics.js";

export interface TypeSyntax {
  raw: string;
  syntax: string;
  universal: boolean;
}

export interface FunctionParameter {
  defaultValue?: string;
  name: string;
  type?: TypeSyntax;
}

export interface LocalDefinition {
  declaration: Declaration;
  name: string;
  value: string;
}

export interface FunctionDefinition {
  atRule: AtRule;
  issues: Diagnostic[];
  locals: Map<string, LocalDefinition>;
  name: string;
  parameters: FunctionParameter[];
  result?: string;
  returnType?: TypeSyntax;
}

export interface DefinitionRecord {
  atRule: AtRule;
  definition?: FunctionDefinition;
  issues: Diagnostic[];
}

export interface DefinitionCollection {
  diagnostics: Diagnostic[];
  records: DefinitionRecord[];
  registry: Map<string, FunctionDefinition>;
}
