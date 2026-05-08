import { mount } from "@wibble/core";
import App from "./App.wib";
import { startRouting } from "./routing";
import "./style.css";

const target = document.querySelector("#app");
if (!target) {
  throw new Error("Missing #app mount target.");
}

startRouting();
mount(App, target, {});
