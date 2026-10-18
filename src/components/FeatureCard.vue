<script setup>
/**
 * 鍥剧墖澧欑殑涓€鏍硷細涓€寮犳墜缁樼殑鎶借薄鎻掔敾 + 鍥炬敞銆?
 *
 * 鐗堝紡鏄?涓婂浘涓嬫枃"锛氭彃鐢诲嚭琛€閾烘弧涓婂崐閮紝鍥炬敞钀藉湪涓嬪崐閮ㄧ殑绾歌壊鍖恒€?
 * 涓婁竴鐗堟妸浜у搧鎴浘鐩存帴褰撲富瑙嗚 鈥斺€?鍏紶榛戣壊缁堢绐楀彛鎺掓垚涓€闈㈠锛?
 * 閭ｆ槸"鎴浘澧?锛屼笉鏄敾鎶ャ€傜敾鎶ョ殑涓昏瑙夊緱鑷繁鐢伙細杩欎竴鐗堟瘡鏍间竴寮?
 * 鎸夊姛鑳芥瀯鍥剧殑鎶借薄鎻掔敾锛堣 Features 閲岀殑 ART锛夛紝鐪熷疄鐣岄潰鐣欏埌灞曞紑鍚庡啀鐪嬨€?
 *
 * 涓夊眰鍙樻崲鍚勮蛋鍚勭殑閬擄細鐖剁骇 grid 鐨勮宸钩绉汇€佸叆鍦虹敤 translate 灞炴€с€?
 * 鎸囬拡鍊炬枩鐢?transform锛屼簰涓嶈鐩栥€?
 */
import BorderGlow from '@/components/vue-bits/BorderGlow.vue'

defineProps({
  item: { type: Object, required: true },
})
</script>

<template>
  <!-- 鏍圭敤 button锛氭暣鏍煎彲鐐癸紝閿洏 Tab / Enter 澶╃敓鑳藉埌銆?
       button 鐨勫唴瀹规ā鍨嬪彧璁?phrasing content锛屾墍浠ュ唴閮ㄤ竴寰?span銆?-->
  <button
    type="button"
    class="cell"
    :style="{ '--tint': item.tint, '--art-ink': item.artInk }"
    :aria-label="`${item.title}锛?{item.desc}`"
  >
    <!-- 鎻掔敾鏄唴鑱?SVG锛堥潤鎬佸唴瀹癸紝鏉ユ簮鍙俊锛夛紝鏍峰紡鍏ㄥ啓鍦?SVG 鑷繁鐨勫睘鎬т笂 -->
    <span class="cell__art" aria-hidden="true">
      <img class="cell__art-img" :src="item.art" alt="" draggable="false" />
    </span>

    <span class="cell__body">
      <!-- 涓嶇紪鍙凤細鍗＄墖涓婂彧鐣欐爣棰樹笌涓€鍙ヨ瘽銆傚簭鍙锋槸鐗堥潰涓婃渶瀹规槗鍙樻垚鍣煶鐨勯偅绉嶈楗帮紝
           鐪熻"绗嚑椤?鐨勪俊鎭紝灞曞紑澶х獥閲屽凡缁忓啓鐫€ -->
      <span class="cell__head">
        <span class="cell__icon" aria-hidden="true">
          <component :is="item.icon" width="14" height="14" />
        </span>
        <span class="cell__title">{{ item.title }}</span>
      </span>
      <span class="cell__desc">{{ item.desc }}</span>
    </span>

    <BorderGlow
      overlay
      :border-radius="8"
      :edge-sensitivity="18"
      :glow-radius="22"
      glow-color="222 95 72"
      :colors="['#7aa7ff', '#a78bfa', '#22d3ee']"
      :fill-opacity="0.32"
    />
  </button>
</template>

<style scoped>
.cell {
  /* 鍐呰窛鍘嬪埌鏈€灏忥細鏍煎瓙閲屾瘡涓€鍍忕礌閮界暀缁欐彃鐢?*/
  --pad: clamp(9px, 0.9vw, 14px);

  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  /* 鍑鸿鐗堝紡锛氬唴璺濆彧缁欏浘娉ㄩ偅涓€鍗婏紝鎻掔敾瑕侀《鍒拌竟 */
  padding: 0;
  overflow: hidden;

  /* 鐩磋鐗堝紡锛?px 鍙敤鏉ユ秷鎺変簹鍍忕礌姣涜竟锛屼笉鏄?鍦嗚" */
  border: 0;
  border-radius: 2px;
  background: var(--tint, #eeebe5);
  color: #16150f;
  font: inherit;
  text-align: left;
  cursor: pointer;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;

  /* 鍊炬枩銆佹姮璧枫€佹斁澶у叡鐢ㄤ竴涓?transform 鈥斺€?鍒嗗嚑鏉″啓浼氫簰鐩歌鐩栥€?
     perspective 鏀跺湪 900px锛氳繙浜?3D 灏辩瓑浜庢病鏈?*/
  transform: perspective(900px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))
    translateZ(var(--lift-z, 0px)) scale(var(--lift, 1));
  transition:
    transform 380ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 380ms ease,
    border-radius 380ms ease;
}

/* 鈹€鈹€ 鎮仠锛氭暣鏍兼湞鎸囬拡鏂瑰悜浠拌捣锛屽悓鏃舵姮绂荤増闈?鈥斺€?
     鏀惧ぇ 6%銆佷笂娴?28px锛堝湪 900px 閫忚涓嬪張鑷甫绾?3% 鐨勫鐩婏級锛?
     鍐嶅帇涓ゅ眰钀藉樊鏄庢樉鐨勬姇褰便€備笂涓€鐗堝彧缁?3.5% 鍙堟病鏈?z 浣嶇Щ锛岀瓑浜庢病鍔?鈹€鈹€ */
.cell:hover,
.cell:focus-visible {
  --lift: 1.1;
  --lift-z: 28px;
  z-index: 2;
  box-shadow:
    0 6px 14px rgba(22, 21, 15, 0.16),
    0 26px 54px rgba(22, 21, 15, 0.22);
  border-radius: 8px;
}

/* 鎻掔敾锛氬嚭琛€閾烘弧涓婂崐閮ㄣ€俹verflow 瑁佹帀 cover 婧㈠嚭鐨勯儴鍒?*/
.cell__art {
  position: relative;
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.cell__art-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform 720ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 鍙湪搴曢儴涓€娈靛寲杩涘崱鐗囪壊锛屽浘涓庢枃瀛椾箣闂翠笉鐣欑‖杈广€?
   涓婁竴鐗堟妸娓愬彉閾烘弧鏁村紶锛堥《閮?78%銆佸簳閮?94%锛夛紝绛変簬缁欐彃鐢荤洊浜嗗眰绾?鈥斺€?
   鏃佽竟鐨勮楗版牸鏄矞鐨勶紝鍗＄墖鍗存槸鐏扮殑锛屼竴鐪煎氨鐪嬪嚭涓嶅 */
.cell__art::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0%,
    transparent 58%,
    color-mix(in srgb, var(--tint) 52%, transparent) 82%,
    color-mix(in srgb, var(--tint) 96%, transparent) 100%
  );
}

.cell__body {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: clamp(2px, 0.35vh, 5px);
  padding: var(--pad);
}

/* 椤电爜閭ｄ竴妗ｅ凡缁忔挙鎺夛細鍗＄墖涓婂彧鐣欐爣棰樹笌涓€鍙ヨ瘽 */
.cell__head {
  display: flex;
  align-items: center;
  gap: 0.46em;
  transition: transform 460ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cell__icon {
  flex: none;
  display: grid;
  place-items: center;
  color: rgba(22, 21, 15, 0.5);
  transition: color 320ms ease;
}

.cell__title {
  min-width: 0;
  /* 杩欎竴鏍肩殑涓昏锛氬瓧鍙峰帇杩囩紪鍙蜂笌姝ｆ枃鏁存暣涓€妗?*/
  font-size: clamp(15px, 1.08vw, 19px);
  font-weight: 700;
  letter-spacing: 0.005em;
  line-height: 1.15;
  color: #16150f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell__desc {
  /* 榛樿灏卞彲瑙侊細淇℃伅涓嶆寕鍦?hover 涓婏紝瑙︽懜涓庨敭鐩橀兘娌℃湁 hover銆?
     浜簳娣卞瓧锛屽姣斿害瀹炴祴 4.65:1锛岀ǔ杩?AA */
  font-size: clamp(10.5px, 0.7vw, 12px);
  line-height: 1.55;
  color: rgba(22, 21, 15, 0.64);
  /* 涓よ灏侀《锛氭牸瀛愰珮搴﹀彧鏈夐偅涔堝锛屽鍑烘潵鐨勭暀缁欎笂闈㈢殑鎻掔敾 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 320ms ease;
}

/* 鈹€鈹€ 寰氦浜掞細鎻掔敾杞昏交鎺ㄨ繎涓€鐐广€傛槸"鍑戣繎鐪?锛屼笉鏄?寮逛竴涓? 鈹€鈹€ */
.cell:hover .cell__art :deep(svg),
.cell:focus-visible .cell__art :deep(svg) {
  transform: scale(1.04);
}

.cell:hover .cell__head,
.cell:focus-visible .cell__head {
  transform: translateX(2px);
}

.cell:hover .cell__icon,
.cell:focus-visible .cell__icon {
  color: rgba(22, 21, 15, 0.82);
}

.cell:hover .cell__desc,
.cell:focus-visible .cell__desc {
  color: rgba(22, 21, 15, 0.82);
}

/* 鐒︾偣蹇呴』鐪嬪緱瑙侊細浜簳涓婄敤鍝佺墝钃濇弿杈癸紝澶栨墿 2px 涓嶅帇鍐呭 */
.cell:focus-visible {
  outline: 2px solid #0a59f7;
  outline-offset: 2px;
}

/* ===== 鍏ュ満锛氬彧璁╁浘娉ㄦ櫄鍗婃媿 =====
 * 鍗￠潰鏈韩鐢卞灞?.cell 鐨勫悎鎴愬姩鐢昏礋璐ｃ€傝繖閲屽彧缁欐枃瀛楀潡涓€涓緢鐭€?
 * 鍙蛋 opacity / translate 鐨勬粸鍚庡啀鐜帮紝璁╀俊鎭儚浠庡崱闈㈤噷娴嚭鏉ャ€?
 * 涓嶅鍥剧墖鍋?blur锛屼篃涓嶇粰姣忓紶鍗″彔鎵厜 鈥斺€?8 寮犲崱鍚屾椂寮€婊ら暅/娣峰悎灞?
 * 鏄繖娆″叆鍦烘渶璐电殑寮€閿€锛屽垹鎺夊悗瑙傛劅淇濈暀锛屽抚鐜囦細绋冲緢澶氥€?
 */
.feature.is-entering .cell__body {
  animation: enter-card-copy 620ms var(--enter-ease) both;
  animation-delay: calc(var(--enter-cards) + var(--i, 0) * var(--enter-cell-step) + 180ms);
}

@keyframes enter-card-copy {
  from {
    opacity: 0;
    translate: 0 6px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* 鈹€鈹€ 澶у睆閫€鍦烘祴鍑犱綍鏃剁殑"闈欐鎬? 鈹€鈹€
 * 鎸囬拡甯稿父杩樺仠鍦ㄥ垰鐐硅繃鐨勯偅涓€鏍间笂锛?hover 浼氭妸鍗＄墖鏀惧ぇ 10%銆佷笂娴?28px銆?
 * 澶у睆鍏ュ満鍙互鐓х潃 hover 褰㈣捣姝ワ紱閫€鍦虹粓鐐瑰繀椤昏惤鍥為潪 hover 灏哄锛屽惁鍒欎細姣?
 * 鍛ㄥ洿鍗＄墖澶т竴鍦堛€傛祴閲忔椂涓存椂鎸傝繖涓被锛屾妸 hover 濮挎€佸帇鍥炲熀鍑嗗€笺€?*/
.cell.is-rest-measure,
.cell.is-rest-measure:hover,
.cell.is-rest-measure:focus-visible {
  --lift: 1;
  --lift-z: 0px;
  border-radius: 2px;
  transition: none;
}

.cell.is-rest-measure .cell__head,
.cell.is-rest-measure:hover .cell__head,
.cell.is-rest-measure:focus-visible .cell__head {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .cell,
  .cell__art :deep(svg),
  .cell__head,
  .cell__icon,
  .cell__desc {
    transition: none;
  }

  .cell__body {
    animation: none;
  }

  /* 灏戝姩鏁堟椂杩?鎶捣"涔熷厤浜嗭細瀹冮潬鐨勬槸缂╂斁锛屾湰韬氨鏄姩鏁?*/
  .cell:hover,
  .cell:focus-visible {
    --lift: 1;
  }

  .cell:hover .cell__art :deep(svg),
  .cell:focus-visible .cell__art :deep(svg),
  .cell:hover .cell__head,
  .cell:focus-visible .cell__head {
    transform: none;
  }
}
</style>

