from PIL import Image
import os

# =========================
# CONFIG
# =========================
SOURCE_IMAGE = "GoodImages.png"
OUTPUT_DIR = "cards_output"

# final app image size
FINAL_WIDTH = 1800
FINAL_HEIGHT = 2100

# card names in reading order:
# top row left -> right, then bottom row left -> right
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

# sheet layout
ROWS = 2
COLS = 4

# light gray page background in GoodImages.png
# we treat pixels close to this as background and trim them away
BG_R = 230
BG_G = 230
BG_B = 230
BG_TOLERANCE = 20


# =========================
# HELPERS
# =========================
def is_background(pixel):
    r, g, b = pixel[:3]
    return (
        abs(r - BG_R) <= BG_TOLERANCE and
        abs(g - BG_G) <= BG_TOLERANCE and
        abs(b - BG_B) <= BG_TOLERANCE
    )


def find_non_background_bbox(img):
    """
    Finds the bounding box of the real card artwork inside one cell,
    trimming away the light page background.
    Returns (left, top, right, bottom)
    """
    img = img.convert("RGBA")
    width, height = img.size
    px = img.load()

    left = width
    top = height
    right = -1
    bottom = -1

    for y in range(height):
        for x in range(width):
            if not is_background(px[x, y]):
                if x < left:
                    left = x
                if y < top:
                    top = y
                if x > right:
                    right = x
                if y > bottom:
                    bottom = y

    if right == -1 or bottom == -1:
        raise ValueError("Could not detect card artwork in one of the grid cells.")

    # Pillow crop uses right/bottom as exclusive
    return (left, top, right + 1, bottom + 1)


def crop_center_fit(img, target_w, target_h):
    """
    Resize image to fill the target size while preserving aspect ratio,
    then crop from center.
    """
    src_w, src_h = img.size
    src_ratio = src_w / src_h
    target_ratio = target_w / target_h

    if src_ratio > target_ratio:
        # image is wider than target -> fit height first
        new_h = target_h
        new_w = round(new_h * src_ratio)
    else:
        # image is taller/narrower than target -> fit width first
        new_w = target_w
        new_h = round(new_w / src_ratio)

    resized = img.resize((new_w, new_h), Image.LANCZOS)

    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    right = left + target_w
    bottom = top + target_h

    return resized.crop((left, top, right, bottom))


# =========================
# MAIN
# =========================
def main():
    if not os.path.exists(SOURCE_IMAGE):
        raise FileNotFoundError(
            f"Could not find '{SOURCE_IMAGE}'. Put GoodImages.png in the same folder as this script."
        )

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    sheet = Image.open(SOURCE_IMAGE).convert("RGBA")
    sheet_w, sheet_h = sheet.size

    cell_w = sheet_w // COLS
    cell_h = sheet_h // ROWS

    print(f"Opened {SOURCE_IMAGE}: {sheet_w}x{sheet_h}")
    print(f"Detected grid: {ROWS} rows x {COLS} columns")
    print(f"Each grid cell: {cell_w}x{cell_h}")
    print()

    index = 0

    for row in range(ROWS):
        for col in range(COLS):
            cell_left = col * cell_w
            cell_top = row * cell_h
            cell_right = (col + 1) * cell_w
            cell_bottom = (row + 1) * cell_h

            cell = sheet.crop((cell_left, cell_top, cell_right, cell_bottom))

            # trim away page background inside the cell
            bbox = find_non_background_bbox(cell)
            card = cell.crop(bbox)

            # resize to final app size
            final_card = crop_center_fit(card, FINAL_WIDTH, FINAL_HEIGHT)

            output_name = OUTPUT_NAMES[index]
            output_path = os.path.join(OUTPUT_DIR, output_name)
            final_card.save(output_path)

            print(f"Saved: {output_path}")
            index += 1

    print()
    print("Done.")
    print(f"All 8 images were saved into: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()