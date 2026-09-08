/** JSON as the Stream Deck app stores settings; the same shape as @elgato/utils' JsonValue, without the dependency. */
export type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };
