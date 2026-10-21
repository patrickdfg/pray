# 캐릭터 에셋

기본 제공 image_gen 도구로 새 이미지를 생성했습니다. 사용자 참고 이미지의 캐릭터를 복사하지 않고, 굵은 외곽선·단순한 셀 채색·통통한 비율의 게임 캐릭터라는 방향을 반영했습니다. 원본 PNG는 생성 이미지 폴더에 보존하고 앱에는 투명도를 유지한 WebP를 사용합니다.

## 소망이

- 파일: `public/sheep-hero.webp`
- 도구: built-in `image_gen.imagegen`, `transparent_background: true`
- 프롬프트:

> Game character sprite asset for a cute Korean mobile prayer quest RPG. Single ORIGINAL chibi baby sheep paladin adventurer, full body in three-quarter view facing right. Oversized round cream fluffy head, tiny dot black eyes, tiny smiling mouth, two pink cheeks, tiny brown hooves, teal short cape and sky blue tunic, small golden star staff in one hoof, tiny round shield with heart emblem. Strong thick uniform dark navy outlines, super simple flat vector-like cartoon game art, saturated cheerful colors, two-tone cel shading, squat 1.5 heads tall, very readable at 100 pixels. Iconic funny adorable confident character. Isolated transparent background, generous padding, no scenery no text no letters no watermark no soft painterly detail no realistic wool.

## 미루기 슬라임

- 파일: `public/slime.webp`
- 도구: built-in `image_gen.imagegen`, `transparent_background: true`
- 프롬프트:

> One original cute sky-blue slime monster mobile RPG game sprite, full body centered isolated on transparent background. A plump teardrop jelly blob with a little tuft, dark navy thick clean uniform cartoon outlines, two big black oval eyes with white shines, tiny wobbly surprised mouth, pink cheeks, two-tone cyan cel shading and one large white glossy highlight. Friendly silly adorable not scary. Tiny violet sleepy cloud perched on head. Facing left three-quarter view. Extremely simple bold flat 2D game art, readable at 100px. No text no numbers no watermark no scenery no realistic texture no painterly shading. Generous padding.

장면의 하늘·언덕·체력바·공격 효과는 코드로 구현했고 캐릭터는 독립된 래스터 에셋입니다.
