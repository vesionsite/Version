/*
 * Vencord, a Discord client mod
 * Copyright (c) 2023 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { UserStore } from "@webpack/common";

const settings = definePluginSettings({
    platform: {
        type: OptionType.SELECT,
        description: "What platform to show up as on",
        restartNeeded: true,
        options: [
            { label: "Windows", value: "win32", default: true },
            { label: "MacOS", value: "darwin" },
            { label: "Linux", value: "linux" },
            { label: "Android", value: "android" },
            { label: "iOS", value: "ios" },
            { label: "iOS (Streaming)", value: "ios_streaming" }, 
            { label: "Xbox", value: "xbox" },
            { label: "Playstation", value: "playstation" },
            { label: "Web", value: "web" },
            { label: "TempleOS", value: "temple" },
            { label: "VR", value: "vr" },
        ]
    }
});

export default definePlugin({
    name: "PlatformSpoofer",
    description: "Spoof what platform or device you're on, including OS and browser properties.",
    authors: [
        {
            name: "Platform Spoofer User",
            id: 0n
        }
    ],
    settings: settings,
    patches: [
        {
            find: "_doIdentify(){",
            replacement: {
                match: /(\[IDENTIFY\].*let.{0,5}=\{.*properties:)(.*),presence/,
                replace: "$1{...$2,...$self.getPlatform(true)},presence"
            }
        },
        {
            find: "#{intl::POPOUT_STAY_ON_TOP}),icon:",
            replacement: {
                match: /(?<=CallTile.{0,15}\.memo\((\i)=>\{)/,
                replace: "$1.platform = $self.getPlatform(false, $1?.participantUserId)?.vcIcon || $1?.platform;"
            }
        },
        {
            find: '("AppSkeleton");',
            replacement: {
                match: /(?<=\.isPlatformEmbedded.{0,50}\i\)\)\}.{0,30})\i\?\i\.\i\.set\(.{0,10}:/,
                replace: ""
            }
        }
    ],
    getPlatform(bypass: boolean, userId?: any) {
        const platform = settings.store.platform ?? "win32";

        if (bypass || (userId && userId === UserStore.getCurrentUser()?.id)) {
            switch (platform) {
                case "win32":
                    return { browser: "Discord Client", os: "Windows", vcIcon: 0 };
                case "darwin":
                    return { browser: "Discord Client", os: "Mac OS X", vcIcon: 0 };
                case "linux":
                    return { browser: "Discord Client", os: "Linux", vcIcon: 0 };
                case "android":
                    return { browser: "Discord Android", os: "Android", vcIcon: 1 };
                case "ios":
                    return { browser: "Discord iOS", os: "iOS", vcIcon: 1 };
                case "ios_streaming":
                    return { 
                        browser: "Discord iOS", 
                        os: "iOS", 
                        vcIcon: 1 ,
                        status: "streaming" 
                    };
                case "xbox":
                    return { browser: "Discord Embedded", os: "Xbox", vcIcon: 2 };
                case "playstation":
                    return { browser: "Discord Embedded", os: "Playstation", vcIcon: 3 };
                case "web":
                    return { browser: "Discord Web", os: "Other", vcIcon: 0 };
                case "temple":
                    return { browser: "Discord Client", os: "TempleOS", vcIcon: 0 };
                case "vr":
                    return { browser: "Discord VR", os: "Other", vcIcon: 4 };
                default:
                    return { browser: "Discord Client", os: "Windows", vcIcon: 0 };
            }
        }

        return null;
    }
});