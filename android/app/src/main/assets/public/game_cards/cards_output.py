from PIL import Image
import os

# ---------- CONFIG ----------
SOURCE_IMAGE = "GoodImages.png"
OUTPUT_DIR = "cards_output"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Output filenames in the same order they appear in GoodImages.png
# Top row:    matching_pairs, crossword_puzzle, checkers, chess
# Bottom row: word_search, solitaire, hangman, brain_training_apps
OUTPUT_NAMES = [
    "matching_pairs.png",
    "crossword_puzzle.png",
    "checkers.png",
    "chess.png",
    "word_search.png",
    "solitaire.png",
    "hangman.png",
    "brain_training_apps.png",
]

# Crop boxes for each card inside GoodImages.png
# Format: (left, top, right, bottom)
# These are based on the sheet layout shown in your image.
CROP_BOXES = [
    (70,   45,  485,  640),   # matching_pairs
    (555,  45,  970,  640),   # crossword_puzzle
    (1040, 45, 1455,  640),   # checkers
    (1530, 45, 1945,  640),   # chess

    (70,  700,  485, 1295),   # word_search
    (555, 700,  970, 1295),   # solitaire
    (1040,700, 1455, 1295),   # hangman
    (1530,700, 1945, 1295),   # brain_training_apps
]

def main():
    if not os.path.exists(SOURCE_IMAGE):
        raise FileNotFoundError(f"Could not find {SOURCE_IMAGE}")

    sheet = Image.open(SOURCE_IMAGE).convert("RGBA")

    for filename, box in zip(OUTPUT_NAMES, CROP_BOXES):
        card = sheet.crop(box)
        out_path = os.path.join(OUTPUT_DIR, filename)
        card.save(out_path)
        print(f"Saved: {out_path}")

    print("\nDone. Your new game images have replaced the old generated ones.")

if __name__ == "__main__":
    main()