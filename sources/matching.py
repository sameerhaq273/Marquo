"""Our own "all of my words" filter, applied to every site's results.

Sites differ: The Pirate Bay already requires every word, 1337x returns titles with
any of them. Filtering here makes all sources (including ones added later) behave alike.

Also lives on the phone, as src/lib/format.ts (matchesAllWords) in the marquo-mobile repository.
Both join tokens the same way; a substring test there once made the two disagree
about whether a title matched.
Change one and change the other.
"""
import re
import unicodedata


def _tokens(text):
    # Fold accents, drop apostrophes ("Don't" -> "dont"), split on anything else
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"['’`]", "", text)
    return re.findall(r"[a-z0-9]+", text)


def _has_word(title_tokens, word):
    if word in title_tokens:
        return True
    # A word may span joined title tokens: "spiderman" matches "Spider-Man"
    for start in range(len(title_tokens)):
        joined = ""
        for token in title_tokens[start:]:
            joined += token
            if joined == word:
                return True
            if len(joined) >= len(word) or not word.startswith(joined):
                break
    return False


def matches_all_words(title, query):
    words = _tokens(query)
    title_tokens = _tokens(title)
    return all(_has_word(title_tokens, w) for w in words)
