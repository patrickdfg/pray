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

## 2026-10-23 · 기도숲 토끼 일러스트

도구: OpenAI 내장 image_gen. 사용자 시안은 스타일 참고로만 사용했으며 원본 파일은 저장소에 포함하지 않았습니다.

### 방 꾸미기 소품

`public/room-flower.webp`, `public/room-lantern.webp`, `public/room-fountain.webp`는 같은 내장 도구로 각각 투명 배경을 생성했습니다. 결과의 배경 투명도를 유지하며 WebP로 인코딩했습니다. 공통 프롬프트에서 아래 대상을 각기 한 번씩 지정했습니다.

공통 프롬프트:
> Use case: illustration-story. Asset type: one transparent-background furniture sprite for the Korean prayer app 기도숲's cozy bunny room. [SUBJECT] Match a cozy cute bunny room illustration: soft painterly cartoon shading, rounded simple shapes, warm rosy brown delicate outlines, warm pink, butter cream and lavender palette, gentle sunlight, polished charming storybook mobile game art. Entire object fully visible centered, tight composition with 10% transparent margin, flat front-facing ground plane with a very subtle contact shadow, no room/background/environment, no text, no numbers, no watermark. True transparent background. Only ONE object.

SUBJECT:
- Flower: One single cute pink terracotta flower pot with three blooming pink tulips and tiny cream daisies, front three-quarter view, a miniature dollhouse decoration, no character.
- Lantern: One single cute miniature table lamp, rounded cream and pink lampshade with scalloped trim, warm glowing yellow light, blush pink ceramic round base, small heart detail, front three-quarter view, dollhouse furniture decoration.
- Fountain: One single cute miniature indoor two-tier fountain, cream ceramic with a blush pink heart topper, tiny turquoise-blue water streams flowing into a round lavender bowl, a few tiny pink flowers at the base, front three-quarter view, dollhouse furniture decoration.

### public/prayer-friends.webp
투명 배경, 토끼와 소망이가 작은 하트를 함께 든 정원. 옆의 숲 친구 카드에 사용합니다.

프롬프트:
> Use case: illustration-story. Asset type: transparent hero illustration for Korean prayer and encouragement app 기도숲. Create an original adorable cream white bunny with long ears, tiny pink cheeks and closed gentle eyes, sitting beside a small fluffy cream lamb friend in a little garden of lavender flowers and pink daisies, holding a tiny pink heart together. Warm pastel pink, butter cream, lavender and muted sage. Soft hand painted storybook gouache, subtle paper texture, rounded simple shapes, delicate brown outlines, generous transparent margin, cohesive compact landscape composition. Calm, comforting, hopeful, polished mobile app illustration. No text, no logo, no watermark, no weapons, no copied existing character. True transparent background.

### public/bunny-prayer-room.webp
햇살 드는 토끼의 방. 사용자가 새로 첨부한 시안의 색감과 포근한 실내 분위기를 반영한 홈 메인 그림입니다. 글자는 이미지에 넣지 않고 앱에서 읽을 수 있는 텍스트로 표시합니다.

프롬프트:
> Use case illustration-story. The input is a style and mood reference, NOT an edit target or a UI to copy. Create ONE beautiful original landscape hero illustration for Korean prayer app 기도숲, a fully painted cozy bunny room (no interface or phone frame). Match the reference's polished cute rounded cartoon aesthetic, warm rosy outlines, blush pink, peach cream, butter yellow, lavender and leafy green, rich cozy props and softly glowing sunlight. Main subject: an adorable white bunny with long pink inner ears and big pink headphones, small dark warm brown outline, eyes gently closed with blush cheeks, writing a prayer and gratitude journal at a light wooden desk by a window. A tiny fluffy lamb friend sits beside the journal, a pink rabbit mug, small warm yellow desk lamp, pastel stacked books, potted pink tulips and hanging leafy vines frame the room. Puffy blue sky and warm morning light through the window. The bunny should be the clear center subject, full ears visible, room items distributed across landscape, especially lush botanical edges. No legible text, no logos, no word Study Bunny, no timer, no typography, no UI, no watermark. Image should work as the full width upper hero artwork on a mobile app with rounded corners; use landscape 3:2 composition.


## 21종 소품 확장 · 2026-10-23

OpenAI 내장 image_gen으로 18종을 각각 생성했습니다. 모바일용으로 최대 512px WebP(품질 88)로 인코딩하고 투명도를 유지했습니다. 기존 3종과 합해 21종입니다. 파일은 `public/room-<id>.webp`이며, 구매 세트와 표시 정보는 `src/room-catalog.ts`에서 관리합니다.

공통 프롬프트:
> Use case: illustration-story. Asset type: ONE individual transparent furniture sprite for a cozy pastel bunny room mobile game. Subject: [SUBJECT]. Style: polished cute storybook mobile game illustration, rounded shapes, delicate warm rosy-brown outlines, soft painterly shading, butter cream, blush pink, lavender, muted sage, gentle warm sunlight. Isolated single complete object centered fully visible with 10% transparent margin. Coherent dollhouse scale and friendly front three-quarter view, subtle contact shadow only. No room, no other props, no environmental background, no lettering, no watermark. True transparent background.

대상별 SUBJECT:
- `succulent`: a tiny mint green ceramic pot with a plump green succulent and a pink heart emblem
- `monstera`: a small leafy monstera plant in a cream basket with a lavender ribbon
- `books`: a neat stack of three pastel pink, mint and lavender books, a tiny heart bookmark
- `journal`: an open cream gratitude journal with a pink cover, a small pink pencil and a flower bookmark, no writing
- `teacup`: a cute pink rabbit shaped ceramic teacup on a cream saucer with one heart shaped cookie
- `vase`: a rounded lavender vase with three pink daisies and two cream blossoms
- `bunny-plush`: a sitting white bunny plush doll with pink ears and a pink bow, cuddly little toy
- `teddy`: a small honey beige teddy bear plush with a lavender bow holding a pink heart
- `cat-cushion`: a rounded sleeping cream kitten cushion with tiny ears, pink cheeks and closed eyes
- `star-cushion`: a soft pale yellow five point star shaped cushion with tiny closed eyes and pink cheeks
- `moon-lamp`: a glowing crescent moon night light on a lavender cloud base with one tiny golden star
- `fairy-lights`: a compact curved string of five warm yellow glowing star fairy lights on a delicate pink cord, hanging decoration
- `sofa`: a miniature soft pink two-seat sofa with rounded arms and two cream heart cushions, front three-quarter view
- `rug`: a miniature oval lavender fluffy rug with scalloped cream edge and a tiny pink flower motif, viewed slightly from above
- `shelf`: a miniature cream two-level bookshelf holding pastel books and a tiny pink vase, front three-quarter view
- `table`: a miniature cream round wooden coffee table with short rounded legs and a tiny pink heart on top, front three-quarter view
- `chair`: a miniature pink wooden chair with bunny ear shaped backrest and a cream round cushion, front three-quarter view
- `clock`: a miniature cream and blush pink mantel clock shaped like a tiny cottage with a heart above its round clock face, no numerals or text
