This extension allows you to calculate the word count for any page or block selection.

**New:**
- Smarter Selection Detection

Word Count now automatically detects the correct “mode” based on how you selected text or blocks:
- Text highlighting inside a single block → counts only the highlighted text
- Checkbox multiselect → counts across all selected blocks
- Drag multiselect (blue highlight) → fully supported and counted
- Context menu → “Word Count (selected blocks)” → counts exactly what you’ve selected
- Command palette hotkey → intelligently decides based on real selection state

*Previously*:
- added support for multiselect contect menu (right-click, Plugins, Word Count (selected blocks))
- added support for Chinese, Japanese and Korean ideographs. Thanks [@aka-phrankie](https://github.com/aka-phrankie)
- now compatible with the new user-defined hotkeys function - see Hotkeys option in Roam Research Settings

Trigger via the Command Palette and a toast with the word count will be created. Or, right-click on a block bullet and select Plugins > Word Count (selected block(s) only).

![word-count](https://user-images.githubusercontent.com/6857790/182960342-d1104d27-d156-4e7a-baf3-c80275e3f397.gif)

To get the word count for a selected area of text, use the Roam Research multi-block select (CTRL-m) and then select the blocks to include. Then trigger this extension using any keyboard shortcut you configure via Settings > Hotkeys, or via the block bullet context menu or the Command Palette.
