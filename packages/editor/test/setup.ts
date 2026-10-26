/** Registers happy-dom globals. Import first in every test file (before React DOM loads). */
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { after } from "node:test";

GlobalRegistrator.register({ url: "https://editor.test/", settings: { enableIframePageLoading: true, handleDisabledFileLoadingAsSuccess: true } });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
after(() => GlobalRegistrator.unregister());
