/** The shipped rule set. `lintRules` is the structural subset behind `lint()`. */
import type { Rule } from "./defineRule";
import { editorAttrValue, noLiquidTagInScript, rawOnlyTrusted } from "./core/security";
import { headingOrder, imgAlt, inputLabel, singleH1 } from "./core/a11y";
import { sectionLiteralArgs, sectionSettingType, sectionUnknownSetting } from "./core/sections";
import { unknownFilter, unknownTag } from "./core/registryRules";
import { noDanglingClose, noDanglingOpen, noLiquidInAttrList, noTagInAttrValue, parseRule, staticAttrName, staticTagName } from "./core/structural";

export const lintRules: readonly Rule<any>[] = [parseRule, noLiquidInAttrList, noTagInAttrValue, noDanglingOpen, noDanglingClose, staticAttrName, staticTagName];

/** The shipped rules. A site's own JavaScript is kept: `noInlineJs` is added only for PageHub's catalogs. */
export const coreRules: readonly Rule<any>[] = [
  ...lintRules, unknownTag, unknownFilter, noLiquidTagInScript, rawOnlyTrusted, editorAttrValue,
  sectionLiteralArgs, sectionSettingType, sectionUnknownSetting, imgAlt, inputLabel, headingOrder, singleH1,
];
