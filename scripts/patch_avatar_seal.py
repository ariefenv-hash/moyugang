""" Surgical cleanup of the wrong seal on the hero avatar:
Remove ① the literal "seal" (印章) vertical text ② the red seal engraved with "seal" characters,
keep ③ the antique collectible seal at the bottom left and all other paintings.
Only do pixel-level inpainting within the bbox, the rest of the image remains completely untouched.
"""
import cv2
import numpy as np

SRC = '/home/z/my-project/src/assets/images/hero_poet_avatar_1791652089636.jpg'
OUT_JPG = SRC  # In-place update (git history preserves the original image)
PREVIEW = '/tmp/avatar_patched_preview.png'

img = cv2.imread(SRC)
h, w = img.shape[:2]
print('image:', w, h)

# Restricted bbox: contains only the "seal" text + the "seal"-engraved red seal
# (measured coordinates: text y 720-805, red seal y 806-890, x 40-91)
X0, Y0, X1, Y1 = 36, 712, 94, 892
roi = img[Y0:Y1, X0:X1]

b, g, r = roi[:, :, 0].astype(int), roi[:, :, 1].astype(int), roi[:, :, 2].astype(int)
# Red seal pixels: significantly larger red channel than green and blue channels
red_mask = ((r > 110) & (r - g > 45) & (r - b > 45)).astype(np.uint8) * 255
# Black text pixels: dark and low saturation
lum = (r + g + b) / 3
dark_mask = ((lum < 120) & (r - g < 60)).astype(np.uint8) * 255

mask_roi = cv2.bitwise_or(red_mask, dark_mask)
# Dilate by 3px to cover the bleeding edges of the ink and seal
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
mask_roi = cv2.dilate(mask_roi, kernel)

mask = np.zeros((h, w), np.uint8)
mask[Y0:Y1, X0:X1] = mask_roi

print('mask pixels:', int((mask > 0).sum()))
if (mask > 0).sum() < 100:
    raise SystemExit('Mask is too small; threshold detection has failed, please re-measure.')

# TELEA inpainting, uses the surrounding rice paper texture to fill in
patched = cv2.inpaint(img, mask, inpaintRadius=5, flags=cv2.INPAINT_TELEA)

cv2.imwrite(OUT_JPG, patched, [cv2.IMWRITE_JPEG_QUALITY, 93])
print('saved:', OUT_JPG)

# Partial magnification comparison image
chk = patched[Y0 - 30:Y1 + 30, 0:160]
chk = cv2.resize(chk, (chk.shape[1] * 3, chk.shape[0] * 3), interpolation=cv2.INTER_LANCZOS4)
cv2.imwrite(PREVIEW, chk)
print('preview:', PREVIEW)
