// @ts-nocheck
import {
	App,
	DataAdapter,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	Vault,
	TFile,
	TFolder,
} from "obsidian";

// Remember to rename these classes and interfaces!

interface ReadavocadoPluginSettings {
	avocadoToken: string;
	rootFolder: string;
	lastSyncTime: number;
	syncInterval: number;
	mapping: Object;
}

const DEFAULT_SETTINGS: ReadavocadoPluginSettings = {
	avocadoToken: "default",
	lastSyncTime: 0,
	rootFolder: "Avocado",
	syncInterval: 60,
	mapping: {},
};

const apiURL = "https://plum.readavocado.com/api/";

export default class ReadavocadoPlugin extends Plugin {
	settings: ReadavocadoPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon(
			"dice",
			"Avocado Plugin",
			(evt: MouseEvent) => {
				// Called when the user clicks the icon.
				new Notice("This is a notice!");
			}
		);
		// Perform additional things with the ribbon
		ribbonIconEl.addClass("my-plugin-ribbon-class");

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Status Bar Text");

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: "open-avocado-modal-simple",
			name: "Open avocado modal (simple)",
			callback: () => {
				new AvocadoModal(this.app).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: "avocado-editor-command",
			name: "Avocado editor command",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection("Avocado Editor Command");
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: "open-avocado-modal-complex",
			name: "Open avocado modal (complex)",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new AvocadoModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AvocadoSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, "click", (evt: MouseEvent) => {
			// console.log("click", evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);

		this.callApi();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async callApi() {
		if(!((Date.now() - this.settings.lastSyncTime) / 1000 / 60 > this.settings.syncInterval)) {
			console.log((Date.now() - this.settings.lastSyncTime) / 1000 / 60, ' Sync not initiated. (minutes since last sync < 60)');
			return;
		}
		const storeFolder = this.app.vault.getAbstractFileByPath(
			this.settings.rootFolder
		);
		if (storeFolder == null || storeFolder instanceof TFile) {
			await this.app.vault.createFolder(this.settings.rootFolder);
		}
		let response
		try {
			response = await fetch(apiURL + "obsidian/fetch/allbooks", {
				headers: {
					Authorization: `Bearer ${this.settings.avocadoToken}`,
				},
			});
	
		} catch (error) {
			console.log(error)
			return;
		}
		new Notice("Avocado: Fetching new highlights");
		if(!response.ok){
			console.log(response, 'die200');
			if(response.status == 405){
				new Notice("Avocado: Invalid token");
			}
			return;
		}
		const data = await response.json();

		for (const books of data) {
			let storeFile = this.app.vault.getAbstractFileByPath(
				`${this.settings.rootFolder}/${books[1].replace(/[^a-zA-Z ]/g, "").trim()}.md`
			);
			let cover =
				books[3].includes("http") == true
					? `![cover](${books[3]})`
					: ``;
			let header =
				`# ${books[1]}
` +
				cover +
				`
## Info
- Title: ${books[1]}
- Author: ${books[2]}
- [Open in Readavocado](https://readavocado.com/app/${encodeURI(books[1])})
## Highlights
`;
			if (storeFile == null || storeFile instanceof TFolder) {
				storeFile = await this.app.vault.create(
					`${this.settings.rootFolder}/${books[1]
						.replace(/[^a-zA-Z ]/g, "")
						.trim()}.md`,
					header
				);
				this.settings.mapping[storeFile.path] = [books[0], 1];
			}
		}

		for (const [key, value] of Object.entries(this.settings.mapping)) {
			const response = await fetch(
				apiURL + `obsidian/fetch/${value[0]}/${value[1]}`,
				{
					headers: {
						Authorization: `Bearer ${this.settings.avocadoToken}`,
					},
				}
			);
			const data = await response.json();
			//TODO: Check in batch if there are new highlights (improve performance)
			let writeFile = this.app.vault.getAbstractFileByPath(key);
			if (writeFile instanceof TFile) {
				await this.app.vault.append(writeFile, data[0]);
			}
			if (data[1] != 0) {
				this.settings.mapping[key] = [value[0], data[1]];
			}
		}
		this.settings.lastSyncTime = Date.now();
		this.saveSettings();
	}
}

class AvocadoModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText("Woah!");
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class AvocadoSettingTab extends PluginSettingTab {
	plugin: ReadavocadoPlugin;

	constructor(app: App, plugin: ReadavocadoPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Settings for Avocado plugin." });

		new Setting(containerEl)
			.setName("Readavocado Token")
			.setDesc("Get your token from https://readavocado.com/user")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.avocadoToken)
					.onChange(async (value) => {
						this.plugin.settings.avocadoToken = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Base sync folder")
			.setDesc("Default is 'Avocado' but you can change the way you want")
			.addText((text) =>
				text
					.setPlaceholder("Enter your secret")
					.setValue(this.plugin.settings.rootFolder)
					.onChange(async (value) => {
						console.log("Secret: " + value);
						this.plugin.settings.rootFolder = value;
						this.plugin.settings.mapping = {};
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Trigger Sync")
			.setDesc("Mannually trigger sync")
			.addButton((button) => {
				button
					.setCta()
					.setTooltip(
						"Manually trigger sync"
					)
					.setButtonText("Initiate Sync")
					.onClick(async () => {
						console.log("Syncing...");
						this.plugin.callApi();
					});
			});
	}
}
