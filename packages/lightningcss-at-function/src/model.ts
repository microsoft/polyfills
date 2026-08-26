import type { Location2, Rule, TokenOrValue } from "lightningcss";
import type { Diagnostic } from "./diagnostics.js";

export type CssValue = TokenOrValue[];

export interface TypeSyntax {
  raw: string;
  syntax: string;
  universal: boolean;
}

export interface FunctionParameter {
  defaultValue?: CssValue;
  name: string;
  type?: TypeSyntax;
}

export interface LocalDefinition {
  name: string;
  value: CssValue;
}

export interface AtFunctionRuleValue {
  body: {
    type: "rule-list";
    value: Rule[];
  };
  loc: Location2;
  name: "function";
  prelude: {
    type: "token-list";
    value: CssValue;
  };
}

export interface AtFunctionRule {
  type: "custom";
  value: AtFunctionRuleValue;
}

export interface FunctionDefinition {
  issues: Diagnostic[];
  locals: Map<string, LocalDefinition>;
  name: string;
  parameters: FunctionParameter[];
  result?: CssValue;
  returnType?: TypeSyntax;
  rule: AtFunctionRule;
  topLevel: boolean;
}

export interface DefinitionRecord {
  definition?: FunctionDefinition;
  issues: Diagnostic[];
  rule: AtFunctionRule;
  topLevel: boolean;
}

export interface DefinitionCollection {
  diagnostics: Diagnostic[];
  records: DefinitionRecord[];
  registry: Map<string, FunctionDefinition>;
}
