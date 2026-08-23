<template>
  <img
    class="favicon-icon"
    src="/favicon.svg"
    alt=""
    aria-hidden="true"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<script setup>
defineProps({
  size: {
    type: [Number, String],
    default: 16,
  },
});
</script>
