import {createFixtureModel} from '@hh9527/dari-core/testing';
export function createIntegration(){const {model}=createFixtureModel();return {checker:model,executor:model};}
