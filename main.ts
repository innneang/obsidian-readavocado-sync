import {
	App,
	DataAdapter,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	Vault,
	TFile,
	requestUrl,
	TFolder,
} from "obsidian";


interface ReadavocadoPluginSettings {
	avocadoToken: string;
	rootFolder: string;
	lastSyncTime: number;
	syncInterval: number;
	mapping: Mapping;
}

interface Mapping {
	[obsidianPath: string]: number[];
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

		this.addSettingTab(new AvocadoSettingTab(this.app, this));

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
			response = await requestUrl({
				url: apiURL + "obsidian/fetch/allbooks",
				method: 'GET',
				headers: {
					Authorization: `Bearer ${this.settings.avocadoToken}`,
				},
			});
		} catch (error) {
			if(error.status == 405) {
				new Notice("Avocado: Invalid token");
			}
			else{
				new Notice("Avocado: Uncaught error");
			}
			return;
		}
		new Notice("Avocado: Fetching new highlights");
		const data = response.json;

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
			const response = await requestUrl(
				{
					url: apiURL + `obsidian/fetch/${value[0]}/${value[1]}`,
					method: 'GET',
					headers: {
						Authorization: `Bearer ${this.settings.avocadoToken}`,
					},
				}
			);
			const data = response.json;
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
