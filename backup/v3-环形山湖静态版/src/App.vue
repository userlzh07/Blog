<script setup>
import SiteNav from './components/SiteNav.vue'
import CometTrail from './components/CometTrail.vue'
</script>

<template>
  <SiteNav />
  <router-view v-slot="{ Component }">
    <transition name="fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
  <CometTrail />
</template>
