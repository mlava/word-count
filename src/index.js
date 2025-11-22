import iziToast from "izitoast";

export default {
  onload: ({ extensionAPI }) => {
    extensionAPI.ui.commandPalette.addCommand({
      label: "Word Count (page)",
      callback: () => wordCount(),
    });
    extensionAPI.ui.commandPalette.addCommand({
      label: "Word Count (selection)",
      callback: () => getSelectionText(undefined, false, true),
    });
    window.roamAlphaAPI.ui.blockContextMenu.addCommand({
      label: "Word Count (selected blocks)",
      callback: (e) => getSelectionText(e, false, false),
    });
    window.roamAlphaAPI.ui.msContextMenu.addCommand({
      label: "Word Count (selected blocks)",
      callback: (e) => getSelectionText(e, true, false),
    });
  },
  onunload: () => {
    window.roamAlphaAPI.ui.blockContextMenu.removeCommand({
      label: "Word Count (selected blocks)",
    });
    window.roamAlphaAPI.ui.msContextMenu.removeCommand({
      label: "Word Count (selected blocks)",
    });
  },
};

function getDragSelectedBlockUidsFromDom() {
  if (typeof document === "undefined") return [];

  const containers = Array.from(
    document.querySelectorAll(
      ".roam-block-container.block-highlight-blue, .roam-block-container.block-highlight"
    )
  );

  return containers
    .map((c) => {
      const input = c.querySelector(".rm-block__input");
      if (!input?.id) return null;
      return getUidFromInputId(input.id);
    })
    .filter(Boolean);
}

function getUidFromInputId(id) {
  // Prefer a regex that captures the last 9 UID-like characters
  // (alphanumeric or hyphen), but fall back to simple slice if needed.
  const match = id.match(/([A-Za-z0-9_-]{9})$/);
  if (match) return match[1];
  
  return id.slice(-9);
}

async function getSelectionText(e, msMode, textMode) {
  let text = "";
  let wordsCount = 0;
  let blockCount = 0;
  let mode = "unknown"; // "dom-selection" | "multi-block" | "single-block"
  const segments = [];

  // 1) Try real DOM selection only when in "text mode" and no context menu event
  let selectedText = "";
  if (textMode && !e && typeof window !== "undefined" && window.getSelection) {
    const selection = window.getSelection();
    selectedText = selection && selection.toString().trim();
  }

  if (textMode && !e && selectedText) {
    // Command palette + highlighted text within a single block
    text = selectedText;
    mode = "dom-selection";
  } else {
    // 2) Block / multiselect modes

    // Only need selected UIDs when:
    // - there's no e (command palette), OR
    // - e exists but msMode is false (blockContextMenu, not msContextMenu)
    let uids = [];
    if (!e || msMode === false) {
      uids = await window.roamAlphaAPI.ui.individualMultiselect.getSelectedUids();
    }

    if (e) {
      // --- Context menu paths ---

      if (msMode === true) {
        // msContextMenu: we get everything from e.blocks
        if (e.hasOwnProperty("blocks") && e.blocks.length > 0) {
          for (let i = 0; i < e.blocks.length; i++) {
            const uid = e.blocks[i]["block-uid"];
            let result = null;
            try {
              result = await window.roamAlphaAPI.data.pull(
                "[:block/string]",
                [":block/uid", uid]
              );
            } catch (err) {
              console.warn("[word-count] pull failed (msContextMenu)", uid, err);
            }
            if (!result || !result[":block/string"]) continue;

            const s = result[":block/string"].toString().trim();
            if (s) {
              segments.push(s);
              blockCount += 1;
            }
          }
        }
        mode = blockCount > 1 ? "multi-block" : "single-block";
      } else {
        // blockContextMenu: may be single block or individual multiselect
        if (uids.length === 0) {
          // Single block only (no individual multiselect)
          const s = (e["block-string"] || "").toString().trim();
          if (s) {
            segments.push(s);
            blockCount = 1;
          }
          mode = "single-block";
        } else {
          // Individual multiselect active – use the selected UIDs
          for (let i = 0; i < uids.length; i++) {
            const uid = uids[i];
            let result = null;
            try {
              result = await window.roamAlphaAPI.data.pull(
                "[:block/string]",
                [":block/uid", uid]
              );
            } catch (err) {
              console.warn("[word-count] pull failed (blockContextMenu)", uid, err);
            }
            if (!result || !result[":block/string"]) continue;

            const s = result[":block/string"].toString().trim();
            if (s) {
              segments.push(s);
              blockCount += 1;
            }
          }
          mode = blockCount > 1 ? "multi-block" : "single-block";
        }
      }
    } else {
      // --- Command palette, no context menu event ---

      // Palette path: if individualMultiselect is empty, try drag-selection too
      if (uids.length === 0) {
        const dragUids = getDragSelectedBlockUidsFromDom();
        if (dragUids.length > 0) {
          uids = dragUids;
        }
      }

      if (uids.length === 0) {
        // No multiselect (checkbox or drag) and no usable DOM selection:
        // fall back to page word count
        await wordCount(true);
        return;
      } else {
        // Command palette + some block selection (checkbox or drag)
        for (let i = 0; i < uids.length; i++) {
          const uid = uids[i];
          let result = null;
          try {
            result = await window.roamAlphaAPI.data.pull(
              "[:block/string]",
              [":block/uid", uid]
            );
          } catch (err) {
            console.warn("[word-count] pull failed (palette)", uid, err);
          }
          if (!result || !result[":block/string"]) continue;

          const s = result[":block/string"].toString().trim();
          if (s) {
            segments.push(s);
            blockCount += 1;
          }
        }
        mode = blockCount > 1 ? "multi-block" : "single-block";
      }
    }

    // Only join segments if we weren't in dom-selection mode
    text = segments.join(" ");
  }

  // If we still have nothing, bail gracefully
  if (!text) {
    iziToast.show({
      theme: "dark",
      message: "No text or blocks selected",
      position: "center",
      close: false,
      timeout: 4000,
      closeOnClick: true,
      displayMode: 2,
    });
    return;
  }

  wordsCount = countWordsWithCJKSupport(text.toString());

  // Build a context-aware message
  let message;
  if (mode === "dom-selection") {
    message = `${wordsCount} words in selected text`;
  } else if (mode === "multi-block") {
    message = `${wordsCount} words across ${blockCount} blocks`;
  } else if (mode === "single-block") {
    message = `${wordsCount} words in this block`;
  } else {
    // Fallback if something unexpected happens
    message = `${wordsCount} words in selected text`;
  }

  iziToast.show({
    theme: "dark",
    message,
    position: "center",
    close: false,
    timeout: 5000,
    closeOnClick: true,
    displayMode: 2,
  });
}

async function wordCount(selected) {
  let wordCount = 0;
  let startBlock;
  const focused = await window.roamAlphaAPI.ui.getFocusedBlock();
  startBlock = focused?.["block-uid"];

  let pageTitle;

  if (startBlock == undefined) {
    startBlock = await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid();
    if (startBlock == null) {
      // probably roam.log page
      const uri = window.location.href;
      const regex = /^https:\/\/roamresearch.com\/.+\/(app|offline)\/\w+$/; // log page
      if (regex.test(uri)) {
        // definitely a log page, so get the corresponding page uid
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        startBlock = mm + "-" + dd + "-" + yyyy;
        const q = `[:find (pull ?page [:node/title]) :where [?page :block/uid "${startBlock}"] ]`;
        const results = await window.roamAlphaAPI.q(q);
        pageTitle = results[0][0].title;
      }
    } else {
      const q = `[:find (pull ?page [:node/title]) :where [?page :block/uid "${startBlock}"] ]`;
      const results = await window.roamAlphaAPI.q(q);
      pageTitle = results[0][0].title;
    }
  } else {
    // get page title
    const blockUIDList = ["" + startBlock + ""];
    const rule =
      "[[ (ancestor ?b ?a) [?a :block/children ?b] ] [ (ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a) ]]";
    const query = `[:find  (pull ?block [:block/uid :block/string])(pull ?page [:node/title :block/uid]) :in $ [?block_uid_list ...] % :where [?block :block/uid ?block_uid_list] [?page :node/title] (ancestor ?block ?page)]`;
    const results = await window.roamAlphaAPI.q(query, blockUIDList, rule);
    pageTitle = results[0][1].title;
  }

  // get words in blocks on page
  const ancestorrule =
    "[[ (ancestor ?b ?a) [?a :block/children ?b] ] [ (ancestor ?b ?a) [?parent :block/children ?b] (ancestor ?parent ?a) ]]";
  const blocks = await window.roamAlphaAPI.q(
    `[:find ?string :in $ ?pagetitle % 
      :where 
        [?block :block/string ?string]
        [?page :node/title ?pagetitle]
        (ancestor ?block ?page)]`,
    pageTitle,
    ancestorrule
  );

  for (let i = 0; i < blocks.length; i++) {
    const CJK = countWordsWithCJKSupport(blocks[i][0].toString());
    wordCount = wordCount + CJK;
  }

  let toast = "";
  toast += wordCount + " words on this page";
  if (selected) {
    toast += "<BR><BR>(no selection; counted the whole page)";
  }

  iziToast.show({
    theme: "dark",
    message: toast,
    position: "center",
    close: false,
    timeout: 5000,
    closeOnClick: true,
    displayMode: 2,
  });
}

function countWordsWithCJKSupport(text) {
  // Define regular expressions
  const cjkRegEx = /[\u3400-\u4db5\u4e00-\u9fa5\uf900-\ufa2d]/; // Matches all CJK ideographs
  const wordBreakRegEx = /\W/; // Matches all characters that "break up" words

  // Initialize variables
  let wordCount = 0;
  let inWord = false;
  const length = text.length;

  // Iterate through the text
  for (let i = 0; i < length; i++) {
    const curChar = text.charAt(i);
    if (cjkRegEx.test(curChar)) {
      // Character is a CJK ideograph
      // Count it as a word
      wordCount += inWord ? 2 : 1;
      inWord = false;
    } else if (wordBreakRegEx.test(curChar)) {
      // Character is a "word-breaking" character
      // If a word was started, increment the word count
      if (inWord) {
        wordCount += 1;
        inWord = false;
      }
    } else {
      // All other characters are "word" characters
      // Indicate that a word has begun
      inWord = true;
    }
  }

  // If the text ended while in a word, make sure to count it
  if (inWord) {
    wordCount += 1;
  }

  return wordCount;
}
