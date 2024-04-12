import { Notice, Setting, TextComponent } from 'obsidian';
import IconFolderSetting from './iconFolderSetting';
import {
  addIconToIconPack,
  createFile,
  createCustomIconPackDirectory,
  deleteIconPack,
  doesIconPackExist,
  getAllIconPacks,
  getFilesInIconPackDirectory,
} from '@app/icon-pack-manager';
import IconFolderPlugin from '@app/main';
import { readFileSync } from '@app/util';

export default class CustomIconPackSetting extends IconFolderSetting {
  private textComponent: TextComponent;
  private dragOverElement: HTMLElement;
  private closeTimer: NodeJS.Timeout;
  private dragTargetElement: HTMLElement;
  private refreshDisplay: () => void;

  constructor(
    plugin: IconFolderPlugin,
    containerEl: HTMLElement,
    refreshDisplay: () => void,
  ) {
    super(plugin, containerEl);
    this.refreshDisplay = refreshDisplay;
    this.dragOverElement = document.createElement('div');
    this.dragOverElement.addClass('iconize-dragover-el');
    this.dragOverElement.style.display = 'hidden';
    this.dragOverElement.innerHTML = '<p>Drop to add icon.</p>';
  }

  private normalizeIconPackName(value: string): string {
    return value.toLowerCase().replace(/\s/g, '-');
  }

  private preventDefaults(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  private highlight(el: HTMLElement): void {
    clearTimeout(this.closeTimer);

    if (!this.dragTargetElement) {
      el.appendChild(this.dragOverElement);
      el.classList.add('iconize-dragover');
      this.dragTargetElement = el;
    }
  }

  private unhighlight(target: HTMLElement, el: HTMLElement): void {
    if (this.dragTargetElement && this.dragTargetElement !== target) {
      this.dragTargetElement.removeChild(this.dragOverElement);
      this.dragTargetElement.classList.remove('iconize-dragover');
      this.dragTargetElement = undefined;
    }

    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      if (this.dragTargetElement) {
        el.removeChild(this.dragOverElement);
        el.classList.remove('iconize-dragover');
        this.dragTargetElement = undefined;
      }
    }, 100);
  }

  public display(): void {
    new Setting(this.containerEl)
      .setName('Add custom icon pack')
      .setDesc('Add a custom icon pack.')
      .addText((text) => {
        text.setPlaceholder('icon pack name');
        this.textComponent = text;
      })
      .addButton((btn) => {
        btn.setButtonText('Add icon pack');
        btn.onClick(async () => {
          const name = this.textComponent.getValue();
          if (name.length === 0) {
            return;
          }

          const normalizedName = this.normalizeIconPackName(name);

          if (await doesIconPackExist(this.plugin, normalizedName)) {
            new Notice('Icon pack already exists.');
            return;
          }

          await createCustomIconPackDirectory(this.plugin, normalizedName);
          this.textComponent.setValue('');
          this.refreshDisplay();
          new Notice(`Icon pack ${name} (${normalizedName}) created.`);
        });
      });

    getAllIconPacks().forEach((iconPack) => {
      const iconPackSetting = new Setting(this.containerEl)
        .setName(`${iconPack.name} (${iconPack.prefix})`)
        .setDesc(`${iconPack.icons.length} icons`);

      iconPackSetting.addButton((btn) => {
        btn.setIcon('plus');
        btn.setTooltip('Add an icon');
        btn.onClick(async () => {
          const fileSelector = document.createElement('input');
          fileSelector.setAttribute('type', 'file');
          fileSelector.setAttribute('multiple', 'multiple');
          fileSelector.setAttribute('accept', '.svg');
          fileSelector.click();
          fileSelector.onchange = async (e) => {
            const target = e.target as HTMLInputElement;
            for (let i = 0; i < target.files.length; i++) {
              const file = target.files[i] as File;
              const content = await readFileSync(file);
              await createFile(this.plugin, iconPack.name, file.name, content);
              addIconToIconPack(iconPack.name, file.name, content);
            }
            iconPackSetting.setDesc(`${target.files.length} icons`);
            new Notice(`${target.files.length} icons added.`);
          };
        });
      });

      iconPackSetting.addButton((btn) => {
        btn.setIcon('refresh-ccw');
        btn.setTooltip('Refresh the icon pack');
        btn.onClick(async () => {
          iconPackSetting.setDesc('Loading icons...');
          const files = await getFilesInIconPackDirectory(
            this.plugin,
            iconPack.name,
          );
          for (const fileName of files) {
            const svg = await this.plugin.app.vault.adapter.read(fileName);
            const iconName = fileName.split('/').pop();
            addIconToIconPack(iconPack.name, iconName, svg);
          }
          new Notice(`Icon pack ${iconPack.name} refreshed.`);
          iconPackSetting.setDesc(`${files.length} icons`);
        });
      });

      iconPackSetting.addButton((btn) => {
        btn.setIcon('trash');
        btn.setTooltip('Remove the icon pack');
        btn.onClick(async () => {
          await deleteIconPack(this.plugin, iconPack.name);
          this.refreshDisplay();
          new Notice(`Icon pack ${iconPack.name} deleted.`);
        });
      });

      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          this.preventDefaults,
          false,
        );
      });
      ['dragenter', 'dragover'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          () => this.highlight(iconPackSetting.settingEl),
          false,
        );
      });
      ['dragleave', 'drop'].forEach((event) => {
        iconPackSetting.settingEl.addEventListener(
          event,
          (event) =>
            this.unhighlight(
              event.currentTarget as HTMLElement,
              iconPackSetting.settingEl,
            ),
          false,
        );
      });
      iconPackSetting.settingEl.addEventListener(
        'drop',
        async (event) => {
          const files = event.dataTransfer.files;
          let successful = false;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type !== 'image/svg+xml') {
              new Notice(`File ${file.name} is not a SVG file.`);
              continue;
            }

            successful = true;
            const content = await readFileSync(file);
            await createFile(this.plugin, iconPack.name, file.name, content);
            addIconToIconPack(iconPack.name, file.name, content);
            iconPackSetting.setDesc(
              `Total icons: ${iconPack.icons.length} (added: ${file.name})`,
            );
          }

          if (successful) {
            new Notice('Icons successfully added.');
          }
        },
        false,
      );
    });
  }
}
