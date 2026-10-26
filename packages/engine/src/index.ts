/** `@pagehub/engine`: parse, edit, state, extensions, rules, storage, import and `createEditor`. The renderer is `./render`, the kits `./kits`, host catalogues `./host`, the canvas `./canvas`. */
export {
  parseSource,
  allNodes,
  isElement,
  isLiquidBlock,
  isBlankText,
  elementName,
  segmentsText,
  NodeTypes,
  type ParseMode,
  type ParseOptions,
  type Range,
  type Positioned,
  type ElementNode,
  type LiquidBlockNode,
  type DocumentNode,
  type LiquidHtmlNode,
} from "./parse/parse";
export { repairNesting, describeNestingFixes, type NestingFix, type RepairResult } from "./parse/repairNesting";
export {
  buildTree,
  flattenTree,
  childrenOf,
  pathAtOffset,
  type TreeNode,
  type ElementTreeNode,
  type BlockTreeNode,
  type ContentTreeNode,
  type TreeBranch,
  type TreeAttribute,
} from "./parse/tree";
export {
  ops,
  applySplices,
  sortSplices,
  lineSplices,
  unescapeText,
  insertSplices,
  removeSplices,
  moveSplices,
  replaceSplices,
  setTextSplices,
  setAttributeSplices,
  wrapSplices,
  setTagArgumentSplices,
  type Splice,
  type MoveSplices,
  insert,
  move,
  remove,
  replace,
  setAttribute,
  setText,
  escapeText,
  wrap,
  setTagArgument,
  readTagArguments,
  liquidString,
  findAttribute,
  containerContent,
  EditError,
  INDENT_UNIT,
  type EditResult,
  type InsertTarget,
  type ContainerNode,
  type OpName,
  type TagWithArguments,
  type TagArgument,
} from "./edit/ops";
export { createParserEnvironment, type ParserTag, type ParseLike } from "./parse/environment";
export { formatSource, type FormatOptions } from "./format/format";
export { formatSiteFiles, siteLayoutHints, type FormatSiteOptions } from "./format/siteFormat";
export { scanCss, emptyHints, type LayoutHints, type LayoutHint } from "./format/cssHints";
export {
  EDIT_ATTRIBUTES,
  EDIT_ATTRIBUTE_PREFIX,
  EDIT_ID_PATTERN,
  LOCK_WORDS,
  EDITABLE_ATTRIBUTE,
  EDITABLE_VALUES,
  isEditAttribute,
  validateEditAttribute,
  stripEditAttributes,
  type EditAttributeName,
  type LockWord,
  type EditableValue,
} from "./attributes/editAttributes";
export { lint, LINT_RULES, type LintIssue, type LintRuleId } from "./lint/lint";
export { ChangeSet, mapPos, mapRange, type Change, type Path, type Files } from "./state/changes";
export { Mapping, type MapStep, type Relocation } from "./state/mapping";
export { EditorState, SourceTree, StateEffect, StateField, effectsOf, setSelection, setHover, selectionField, EMPTY_SELECTION, type Selection, type EffectValue } from "./state/state";
export { Transaction, type Origin, type Annotations } from "./state/transaction";
export { TransactionBuilder, type InsertPoint } from "./state/builder";
export { HandleRegistry, type NodeHandle, type ElementHandle, type HandleKind } from "./state/handles";
export { Store, createStore, type StoreOptions } from "./state/store";
export { sessionIdentity, type Identity } from "./identity/session";
export { Configuration, ConfigError, Prec, defineFacet, Facet, EXTENSION, type Extension, type FacetInput, type PrecName, type RuntimeExtension } from "./extensions/extension";
export { elementsFacet, commandsFacet, keybindingsFacet, menusFacet, toolbarFacet, paletteFacet, rulesFacet, storageFacet, dataSourcesFacet, panelsFacet, normalizersFacet, componentsFacet, parserTagsFacet } from "./extensions/facets";
export { definePlugin } from "./extensions/plugin";
export { t, Schema, SchemaError, isSafeExpression, type SourceContext } from "./schema/t";
export { defineElement, type ElementDef, type PropsSpec, type PropsOf } from "./elements/defineElement";
export { attr, arg, cls, text, tagName, splitClass, groupTest, type Binding, type ClassGroup } from "./elements/bindings";
export { resolveElement, htmlElement } from "./elements/resolve";
export { compileSelector } from "./elements/selector";
export { defineCommand, canRun, runCommand, selectAfter, type Command, type CommandContext, type UiContext } from "./commands/defineCommand";
export { contributes, type Contributions, type KeyBinding, type MenuItem, type PaletteItem, type ToolbarItem } from "./commands/contributes";
export { evaluateWhen, parseWhen } from "./commands/when";
export { runKey, keyLabel, bindingsFor, whenContext } from "./commands/keymap";
export { normalizeKey, eventKey, type Platform, type KeyEventLike } from "./commands/keys";
export { history, historyField, closeHistoryGroup, undo, redo, GROUP_DELAY } from "./history/history";
export { defineRule, type Rule, type RuleMeta, type RuleContext, type Visitor, type Report, type Suggestion, type Severity, type FixKind, type RuleRegistry } from "./rules/defineRule";
export { runRules, createRuleRunner, type Diagnostic, type RunOptions, type RuleRunner } from "./rules/run";
export { applyFixes, sanitizeSource } from "./rules/fixer";
export { coreRules, lintRules } from "./rules/coreRules";
export { jsIn, noInlineJs } from "./rules/core/security";
export { registryOfEngine } from "./rules/registry";
export { beforeTransaction, afterTransaction, onBatchComplete, AFTER_LOOP_LIMIT, type BeforeHook, type AfterHook, type BatchCompleteHook, type Veto } from "./normalize/hooks";
export { checkContentOnly, checkContentChanges, type ContentCheck, type ContentCheckOptions } from "./content/checkContentOnly";
export { checkLockChanges, type LockCheck, type LockCheckOptions } from "./content/checkLocks";
export { contentMode } from "./content/contentMode";
export { probeCommand } from "./content/commandGate";
export { contentSelection, isContentTarget } from "./content/contentSelection";
export { defineStorage, isStorage, prepareWrite, prepareWriteFacet, type StorageDef, type StorageSpec, type WriteResult, type BatchChange, type BatchWriteResult, type PrepareWriteHook, type PrepareWriteInput, type PrepareWriteResult } from "./storage/defineStorage";
export { StorageError, isStorageError, storageErrorFromResponse, storageErrorFromNetwork, STORAGE_ERROR_CODES, type StorageErrorCode } from "./storage/storageError";
export { memoryStorage, type MemoryStorage } from "./storage/memory";
export { unifiedDiff, fileDiff, diffSplices, type FileDiff } from "./storage/diff";
export { normalize, fingerprint, mintEditId, persistedIdentity, DEFAULT_ID_ELEMENTS, type NormalizeOptions, type NormalizeResult } from "./identity/persisted";
export { editIdsIn, EditIdConflictError, assertUniqueEditIds } from "./identity/editIds";
export { autosave, type Autosave, type AutosaveOptions } from "./editor/autosave";
export { createEditor, Editor, type CreateEditorOptions, type SaveResult, type Manifest, type Role, type EditorEvents, type ConflictResolution } from "./editor/createEditor";
export { importHtml, escapeLiquid, type ImportReport, type ImportOptions } from "./import/importHtml";
export { importSite, liftPartials, pagePath, type ImportSiteReport } from "./import/importSite";
export { templateToPage, type ShopifyTemplate, type ShopifyTemplateSection, type TemplateReportEntry } from "./import/shopifyTemplates";
export { TYPE_HIDE, TYPE_SECTIONS, typeSpec, inspectorSpecOf, type InspectorSpec, type HideKey } from "./elements/inspectorSpec";
export { ruleOptionsOf, isMarkup } from "./editor/diagnostics";
export { variableCatalogue, filterVariables, variableGroupsFacet, SYSTEM_VARIABLES, type VariableItem, type VariableGroup, type VariableSource, type VariableGroupProvider } from "./editor/variables";
