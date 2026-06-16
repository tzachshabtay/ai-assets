import Phaser from "phaser";
import { AiAssetRuntime } from "@ai-game-assets/phaser";
import {
  menuButtonSize,
  menuPanelSize,
  menuPauseNewGameButtonY,
  menuPauseResumeButtonY,
  menuSingleButtonY,
  menuTitleY,
  menuVolumeSlider,
} from "./assetConfig.js";

type ButtonState = "idle" | "hover" | "clicked";

export class GameMenuController {
  private container?: Phaser.GameObjects.Container;
  private panel?: Phaser.GameObjects.Image;
  private title?: Phaser.GameObjects.Text;
  private volumeValue?: Phaser.GameObjects.Text;
  private volumeFill?: Phaser.GameObjects.Rectangle;
  private volumeKnob?: Phaser.GameObjects.Ellipse;
  private newGameButton?: Phaser.GameObjects.Sprite;
  private newGameButtonText?: Phaser.GameObjects.Text;
  private resumeButton?: Phaser.GameObjects.Sprite;
  private resumeButtonText?: Phaser.GameObjects.Text;
  private newGameButtonState: ButtonState = "idle";
  private resumeButtonState: ButtonState = "idle";
  private isDraggingVolume = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly runtime: AiAssetRuntime,
    private masterVolume: number,
    private readonly callbacks: {
      onNewGame: () => void;
      onResume: () => void;
      onVolumeChange: (volume: number) => void;
      onMenuShown?: (showResume: boolean) => void;
    }
  ) {}

  create(title: string): void {
    this.panel = this.scene.add.image(0, 0, this.runtime.key("ui.panel"));
    this.panel.setDisplaySize(menuPanelSize.width, menuPanelSize.height);

    this.title = this.scene.add.text(0, menuTitleY, title, {
      align: "center",
      color: "#f8fafc",
      fontSize: "24px"
    });
    this.title.setOrigin(0.5);

    const volumeLabel = this.scene.add.text(-95, menuVolumeSlider.y - 25, "Master Volume", {
      align: "left",
      color: "#dbeafe",
      fontSize: "14px"
    });
    volumeLabel.setOrigin(0, 0.5);
    this.volumeValue = this.scene.add.text(95, menuVolumeSlider.y - 25, "100%", {
      align: "right",
      color: "#f8fafc",
      fontSize: "14px"
    });
    this.volumeValue.setOrigin(1, 0.5);

    const volumeTrack = this.scene.add.rectangle(
      0,
      menuVolumeSlider.y,
      menuVolumeSlider.width,
      8,
      0x334155,
      0.95
    );
    volumeTrack.setInteractive({ useHandCursor: true });
    this.volumeFill = this.scene.add.rectangle(
      -menuVolumeSlider.width / 2,
      menuVolumeSlider.y,
      menuVolumeSlider.width,
      8,
      0x38bdf8,
      1
    );
    this.volumeFill.setOrigin(0, 0.5);
    this.volumeKnob = this.scene.add.ellipse(0, menuVolumeSlider.y, 20, 20, 0xf8fafc, 1);
    this.volumeKnob.setStrokeStyle(3, 0x0f172a, 1);
    this.volumeKnob.setInteractive({ useHandCursor: true });

    volumeTrack.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDraggingVolume = true;
      this.setMasterVolumeFromPointer(pointer);
    });
    this.volumeKnob.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.isDraggingVolume = true;
      this.setMasterVolumeFromPointer(pointer);
    });
    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isDraggingVolume) this.setMasterVolumeFromPointer(pointer);
    });
    this.scene.input.on("pointerup", () => {
      this.isDraggingVolume = false;
    });

    this.newGameButton = this.createButton(menuSingleButtonY, "New Game", () => {
      this.playNewGameButtonAnimation("hover");
      this.callbacks.onNewGame();
    });
    this.newGameButtonText = this.createButtonText(menuSingleButtonY, "New Game");
    this.playNewGameButtonAnimation("idle");

    this.resumeButton = this.createButton(menuPauseResumeButtonY, "Resume", () => {
      this.playResumeButtonAnimation("hover");
      this.callbacks.onResume();
    });
    this.resumeButtonText = this.createButtonText(menuPauseResumeButtonY, "Resume");
    this.playResumeButtonAnimation("idle");

    this.container = this.scene.add.container(320, 320, [
      this.panel,
      this.title,
      volumeLabel,
      this.volumeValue,
      volumeTrack,
      this.volumeFill,
      this.volumeKnob,
      this.resumeButton,
      this.resumeButtonText,
      this.newGameButton,
      this.newGameButtonText
    ]);
    this.container.setDepth(100);
    this.updateMasterVolumeUi();
    this.show(title);
  }

  show(title: string, options: { showResume?: boolean } = {}): void {
    const showResume = Boolean(options.showResume);
    this.title?.setText(title);
    this.layoutControls(showResume);
    this.playNewGameButtonAnimation("idle");
    this.playResumeButtonAnimation("idle");
    this.newGameButton?.setInteractive({ useHandCursor: true });
    this.resumeButton?.setVisible(showResume);
    this.resumeButton?.setActive(showResume);
    this.resumeButtonText?.setVisible(showResume);
    if (showResume) {
      this.resumeButton?.setInteractive({ useHandCursor: true });
    } else {
      this.resumeButton?.disableInteractive();
    }
    this.container?.setVisible(true);
    this.container?.setActive(true);
    this.callbacks.onMenuShown?.(showResume);
  }

  hide(): void {
    this.newGameButton?.disableInteractive();
    this.resumeButton?.disableInteractive();
    this.container?.setVisible(false);
    this.container?.setActive(false);
  }

  setPanelTexture(textureKey: string): void {
    this.panel?.setTexture(textureKey);
    this.panel?.setDisplaySize(menuPanelSize.width, menuPanelSize.height);
  }

  setButtonTexture(textureKey: string): void {
    for (const button of [this.newGameButton, this.resumeButton]) {
      button?.setTexture(textureKey);
      button?.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
    }
  }

  refreshButtonAnimation(assetId: string): void {
    if (assetId === `ui.button.${this.newGameButtonState}`) {
      this.playNewGameButtonAnimation(this.newGameButtonState);
    }
    if (assetId === `ui.button.${this.resumeButtonState}`) {
      this.playResumeButtonAnimation(this.resumeButtonState);
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateMasterVolumeUi();
  }

  private createButton(
    y: number,
    label: "New Game" | "Resume",
    onClick: () => void
  ): Phaser.GameObjects.Sprite {
    const button = this.scene.add.sprite(0, y, this.runtime.key("ui.button.idle"));
    const playAnimation = label === "New Game"
      ? (state: ButtonState) => this.playNewGameButtonAnimation(state)
      : (state: ButtonState) => this.playResumeButtonAnimation(state);

    button.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerover", () => playAnimation("hover"));
    button.on("pointerout", () => playAnimation("idle"));
    button.on("pointerdown", () => playAnimation("clicked"));
    button.on("pointerup", onClick);

    return button;
  }

  private createButtonText(y: number, text: string): Phaser.GameObjects.Text {
    const label = this.scene.add.text(0, y, text, {
      align: "center",
      color: "#f8fafc",
      fontSize: "18px"
    });
    label.setOrigin(0.5);

    return label;
  }

  private layoutControls(showResume: boolean): void {
    const newGameY = showResume ? menuPauseNewGameButtonY : menuSingleButtonY;

    this.newGameButton?.setPosition(0, newGameY);
    this.newGameButtonText?.setPosition(0, newGameY);
    this.resumeButton?.setPosition(0, menuPauseResumeButtonY);
    this.resumeButtonText?.setPosition(0, menuPauseResumeButtonY);
  }

  private playNewGameButtonAnimation(state: ButtonState): void {
    if (!this.newGameButton) return;

    this.newGameButtonState = state;
    this.newGameButton.play(`ui.button.${state}`, true);
    this.newGameButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
  }

  private playResumeButtonAnimation(state: ButtonState): void {
    if (!this.resumeButton) return;

    this.resumeButtonState = state;
    this.resumeButton.play(`ui.button.${state}`, true);
    this.resumeButton.setDisplaySize(menuButtonSize.width, menuButtonSize.height);
  }

  private setMasterVolumeFromPointer(pointer: Phaser.Input.Pointer): void {
    const containerX = this.container?.x ?? 320;
    const localX = pointer.worldX - containerX;
    const volume = (localX + (menuVolumeSlider.width / 2)) / menuVolumeSlider.width;

    this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
    this.updateMasterVolumeUi();
    this.callbacks.onVolumeChange(this.masterVolume);
  }

  private updateMasterVolumeUi(): void {
    const width = menuVolumeSlider.width * this.masterVolume;
    const knobX = (-menuVolumeSlider.width / 2) + width;

    this.volumeFill?.setSize(width, 8);
    this.volumeKnob?.setPosition(knobX, menuVolumeSlider.y);
    this.volumeValue?.setText(`${Math.round(this.masterVolume * 100)}%`);
  }
}
