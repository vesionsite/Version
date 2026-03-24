/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType } from "@api/Commands";
import { Devs } from "@utils/constants";
import { sendMessage } from "@utils/discord";
import definePlugin from "@utils/types";
import { CloudUpload as TCloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findLazy } from "@webpack";
import { SelectedChannelStore } from "@webpack/common";

const CloudUpload: typeof TCloudUpload = findLazy(m => m.prototype?.trackUploadFinished);

const generateImage = async (text: string): Promise<string> => {
    
    const MAX_WIDTH = 500; 
    const FONT_SIZE = 16;
    const LINE_HEIGHT = 1.375; 
    const PADDING = 2; 
    const FONT_STACK = '"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    ctx.font = `${FONT_SIZE}px ${FONT_STACK}`;

    const wrapText = (text: string, maxWidth: number): string[] => {
        const words = text.split(" ");
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    };

    const lines = wrapText(text, MAX_WIDTH);
    const lineHeightPx = FONT_SIZE * LINE_HEIGHT;

    
    let maxLineWidth = 0;
    for (const line of lines) {
        const width = ctx.measureText(line).width;
        if (width > maxLineWidth) maxLineWidth = width;
    }

    canvas.width = maxLineWidth + (PADDING * 2);
    canvas.height = (lines.length * lineHeightPx) + (PADDING * 2);

    
    ctx.font = `${FONT_SIZE}px ${FONT_STACK}`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";

    const isRTL = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
    if (isRTL) {
        ctx.direction = "rtl";
        ctx.textAlign = "right";
    } else {
        ctx.textAlign = "left";
    }

    lines.forEach((line, index) => {
        const x = isRTL ? canvas.width - PADDING : PADDING;
        const y = PADDING + (index * lineHeightPx);
        ctx.fillText(line, x, y);
    });

    return canvas.toDataURL("image/png");
};

export default definePlugin({
    name: "PicGenerator",
    description: "Generates a transparent image with text using /pic command",
    authors: [Devs["3Tb"]],

    commands: [
        {
            name: "pic",
            description: "Create an image with your text",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "text",
                    description: "The text to put in the image",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: async (args, ctx) => {
                const text = args.find(a => a.name === "text")?.value;

                if (!text) {
                    return {
                        content: "Please provide text!",
                        ephemeral: true
                    };
                }

                try {
                    const imageDataUrl = await generateImage(text);
                    const response = await fetch(imageDataUrl);
                    const blob = await response.blob();
                    const file = new File([blob], "text-image.png", { type: "image/png" });

                    const channelId = ctx?.channel?.id || SelectedChannelStore.getChannelId();
                    if (channelId) {
                        const upload = new CloudUpload({
                            file,
                            platform: CloudUploadPlatform.WEB,
                        }, channelId);

                        await sendMessage(channelId, {
                            content: "",
                        }, true, {
                            attachmentsToUpload: [upload]
                        });
                    }
                } catch (err) {
                    console.error("[PicGenerator] Error:", err);
                    return {
                        content: "Failed to generate image. Please try again.",
                        ephemeral: true
                    };
                }
            }
        }
    ]
});
