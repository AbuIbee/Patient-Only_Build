import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import Field from './AccessibleAuthField';

describe('sign-in field accessibility',()=>{
  it('associates the visible label even with a nested password wrapper',()=>{
    const html=renderToStaticMarkup(<Field label="Password" required><div><input type="password"/><button type="button">Show</button></div></Field>);
    const id=html.match(/<input[^>]*\sid="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();expect(html).toContain(`for="${id}"`);
    expect(html).toContain('aria-required="true"');
  });
  it('connects announced validation errors to their own field',()=>{
    const html=renderToStaticMarkup(<Field label="Email Address" error="Enter your email"><input type="email"/></Field>);
    const id=html.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${id}" role="alert"`);expect(html).toContain('aria-invalid="true"');
  });
});
