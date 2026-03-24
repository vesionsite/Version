/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2024 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const settings = definePluginSettings({
    maxAccounts: {
        description: "Maximum number of accounts (0 for 100/Unlimited)",
        default: 0,
        type: OptionType.NUMBER,
        restartNeeded: true,
    },
});

export default definePlugin({
    name: "UnlimitedAccounts",
    description: "Increases the limit of accounts you can add to Discord.",
    authors: [Devs["3Tb"]],
    settings,
    patches: [
        {
            find: "multiaccount_cta_tooltip_seen",
            replacement: {
                // Targets the default limit of 5 in the switch-accounts-modal context
                match: /(\i=)5(,\i="switch-accounts-modal")/,
                replace: "$1$self.getMaxAccounts()$2",
            },
        },
    ],
    getMaxAccounts() {
        const limit = settings.store.maxAccounts;
        // Using 100 as a safe 'infinite' value for Discord's UI
        return limit <= 0 ? 100 : limit;
    },
});
