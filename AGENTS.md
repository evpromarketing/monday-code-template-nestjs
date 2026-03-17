# AGENTS.md — NestJS Backend Engineering Standards

This document defines the coding standards, architectural patterns, and best practices
for this NestJS backend application. All generated and modified code must conform to
these rules.

---

## TypeScript Strictness

- **Never** use `any`. Use `unknown` when the type is truly indeterminate, then narrow with type guards.
- Prefer `interface` for object shapes that may be extended; use `type` for unions, intersections, and mapped types.
- Enable and respect `strict: true` in `tsconfig.json` (including `noImplicitAny`, `strictNullChecks`, `strictPropertyInitialization`).
- Use `readonly` for properties and parameters that should not be reassigned.
- Use `as const` for literal tuples and constant objects.
- Avoid type assertions (`as`); prefer type guards and discriminated unions.
- Prefer `satisfies` over `as` when validating a value conforms to a type while preserving its narrower inferred type.
- Generic type parameters must be constrained (`<T extends SomeBase>`) rather than left unbounded when possible.

---

## SOLID Principles

### Single Responsibility (SRP)

- Each class has exactly one reason to change.
- Controllers handle HTTP concerns only: parse request, delegate to service, return response.
- Services contain business logic only — no HTTP objects (`Request`, `Response`), no direct database queries.
- Repositories encapsulate all data-access logic.

### Open/Closed (OCP)

- Extend behavior through composition, decorators, and strategy patterns — not by modifying existing classes.
- Use NestJS custom decorators and interceptors to add cross-cutting behavior.

### Liskov Substitution (LSP)

- Depend on abstractions (interfaces/abstract classes). Any implementation must be substitutable without altering correctness.
- Inject services via interface tokens using `provide`/`useClass` or `useFactory`.

### Interface Segregation (ISP)

- Keep interfaces small and focused. Prefer multiple narrow interfaces over one large one.
- A class should not be forced to implement methods it does not use.

### Dependency Inversion (DIP)

- High-level modules must not depend on low-level modules. Both depend on abstractions.
- Always inject dependencies via constructor injection. Never instantiate collaborators with `new` inside a class.
- Use custom injection tokens for abstract dependencies:

```typescript
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    UserService,
  ],
})
export class UserModule {}
```

---

## Project Structure

Organize code by **domain/feature module**, not by technical layer:

```
src/
├── main.ts
├── app.module.ts
├── common/                     # Shared utilities, guards, filters, interceptors, pipes
│   ├── decorators/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pipes/
│   ├── types/
│   └── utils/
├── config/                     # Configuration module and validation schemas
│   ├── config.module.ts
│   └── config.schema.ts        # Zod schema for env validation
├── <feature>/                  # One directory per bounded context / feature
│   ├── <feature>.module.ts
│   ├── <feature>.controller.ts
│   ├── <feature>.service.ts
│   ├── <feature>.repository.ts
│   ├── dto/
│   │   ├── create-<feature>.dto.ts
│   │   └── update-<feature>.dto.ts
│   ├── schemas/                # Zod validation schemas
│   │   └── <feature>.schema.ts
│   ├── entities/
│   │   └── <feature>.entity.ts
│   ├── interfaces/
│   │   └── <feature>-repository.interface.ts
│   └── __tests__/
│       ├── <feature>.controller.spec.ts
│       ├── <feature>.service.spec.ts
│       └── <feature>.repository.spec.ts
```

### File Naming

- Use **kebab-case** for all file names: `user-profile.service.ts`.
- Every file exports exactly one primary class/function/type.
- Suffix files with their NestJS role: `.controller.ts`, `.service.ts`, `.module.ts`, `.guard.ts`, `.interceptor.ts`, `.filter.ts`, `.pipe.ts`, `.repository.ts`, `.entity.ts`, `.dto.ts`, `.schema.ts`.

---

## Input Validation with Zod

- Define Zod schemas as the **single source of truth** for request validation.
- Derive TypeScript types from Zod schemas using `z.infer<typeof schema>`.
- Apply validation at the controller boundary using a custom `ZodValidationPipe`:

```typescript
// common/pipes/zod-validation.pipe.ts
import { PipeTransform, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.flatten().fieldErrors,
      });
    }
    return result.data;
  }
}
```

- Usage in controllers:

```typescript
@Post()
create(@Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto) {
  return this.userService.create(dto);
}
```

- Never trust client input. Validate path params, query params, and headers when relevant.
- Do not use `class-validator` / `class-transformer`. Zod is the validation layer.

---

## DTOs and Data Flow

- DTOs are plain objects (not classes with decorators). Derive them from Zod schemas.
- Never expose entity/database models directly in API responses. Map entities to response DTOs.
- Separate `CreateXDto`, `UpdateXDto`, and `XResponseDto` per feature.

```typescript
// dto/create-user.dto.ts
import { z } from 'zod';
import { CreateUserSchema } from '../schemas/user.schema';

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
```

---

## Error Handling

- Use NestJS built-in HTTP exceptions (`BadRequestException`, `NotFoundException`, `ForbiddenException`, etc.) in controllers and services.
- Create domain-specific exceptions extending `HttpException` when built-ins lack clarity.
- Implement a global `AllExceptionsFilter` to catch unhandled errors, log them, and return a safe response.
- Never leak stack traces, internal paths, or implementation details in production responses.
- Always include a machine-readable error code alongside human-readable messages.

```typescript
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : undefined);

    response.status(status).json({
      statusCode: status,
      message: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : (exception as HttpException).message,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## Security

- **Helmet**: Apply `helmet()` middleware in `main.ts` for HTTP security headers.
- **CORS**: Configure CORS explicitly with an allowlist of origins. Never use `origin: true` in production.
- **Rate limiting**: Use `@nestjs/throttler` on public-facing endpoints.
- **Authentication**: Implement via Guards. Never check auth inside service methods.
- **Authorization**: Use custom decorators + Guards for role/permission checks.
- **Secrets**: Never hardcode secrets. Load from environment variables via `@nestjs/config` with Zod schema validation.
- **SQL injection**: Use parameterized queries exclusively. Never interpolate user input into queries.
- **Mass assignment**: Only accept explicitly defined DTO fields. Zod's `.strip()` or `.strict()` prevents extra properties.
- **Logging**: Never log secrets, tokens, passwords, or PII. Use a structured logger (e.g., `pino`, `winston`).
- **Dependencies**: Regularly audit with `npm audit`. Pin dependency versions.

---

## Configuration Management

- Use `@nestjs/config` with a Zod schema to validate all environment variables at startup.
- Fail fast: if a required env var is missing or malformed, the application must not start.
- Group related config into namespaces (`database`, `auth`, `redis`, etc.).

```typescript
// config/config.schema.ts
import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
```

---

## Testing

### Unit Tests

- Colocate unit tests in a `__tests__/` directory within each feature module.
- File naming: `<name>.spec.ts`.
- Mock all external dependencies. Use NestJS `Test.createTestingModule` to build isolated test modules.
- Test one behavior per test case. Name tests descriptively: `it('should throw NotFoundException when user does not exist')`.
- Aim for high coverage on services and business logic. Controllers need coverage for edge cases (validation, auth).

### Integration / E2E Tests

- Place in the top-level `test/` directory.
- File naming: `<feature>.e2e-spec.ts`.
- Test the full HTTP lifecycle with `supertest`.
- Use a real (or in-memory) database with test seeds, isolated per test suite.
- Always clean up state between tests.

### General Rules

- No test should depend on execution order or shared mutable state.
- Use factories or builders for test data — not raw object literals scattered across tests.
- Assert on behavior, not implementation details. Avoid asserting on how many times a mock was called unless the call itself is the behavior.

---

## NestJS Patterns

### Modules

- Every feature has its own module. Never register providers in `AppModule` directly (except truly global providers).
- Use `forRoot()` / `forRootAsync()` for configurable modules.
- Export only what other modules need. Keep internal providers private.

### Controllers

- Thin controllers. Max responsibility: parse input, call service, return output.
- Use appropriate HTTP methods and status codes (`@HttpCode`, `@Header`).
- Decorate with `@ApiTags`, `@ApiOperation`, `@ApiResponse` for OpenAPI documentation.
- Group related endpoints under a versioned path prefix (`/api/v1/users`).

### Services

- Contain all business logic.
- Must be stateless — no instance-level mutable state.
- Throw domain-appropriate HTTP exceptions.
- Return typed results, never `Promise<any>`.

### Guards

- Use for authentication and authorization exclusively.
- Implement `CanActivate` interface.
- Attach metadata with custom decorators (`@Roles`, `@Public`).

### Interceptors

- Use for cross-cutting concerns: logging, response transformation, caching, timing.
- Implement `NestInterceptor` interface.

### Pipes

- Use for input transformation and validation.
- Apply at the param level or controller level — not globally unless necessary.

### Exception Filters

- Use the global `AllExceptionsFilter`.
- Add feature-specific filters only when specialized error handling is required.

---

## Logging

- Use NestJS `Logger` or a structured logging library (`pino` via `nestjs-pino`).
- Log at appropriate levels: `error` for failures, `warn` for degraded states, `log`/`info` for key events, `debug` for development-only detail.
- Include correlation/request IDs in logs for traceability.
- Never log sensitive data (passwords, tokens, PII).

---

## Naming Conventions

| Artifact        | Convention                | Example                        |
|-----------------|---------------------------|--------------------------------|
| Class           | PascalCase                | `UserService`                  |
| Interface       | PascalCase (no `I` prefix)| `UserRepository`               |
| Method          | camelCase                 | `findByEmail`                  |
| Variable        | camelCase                 | `accessToken`                  |
| Constant        | UPPER_SNAKE_CASE          | `MAX_RETRY_COUNT`              |
| Enum            | PascalCase                | `UserRole`                     |
| Enum member     | PascalCase                | `UserRole.Admin`               |
| File            | kebab-case + suffix       | `user-profile.service.ts`      |
| DB table        | snake_case, plural        | `user_profiles`                |
| DB column       | snake_case                | `created_at`                   |
| Env variable    | UPPER_SNAKE_CASE          | `DATABASE_URL`                 |
| Route path      | kebab-case, plural        | `/user-profiles`               |

---

## Code Style

- Max function length: ~20 lines. Extract helpers when exceeded.
- Max file length: ~200 lines. Split into smaller modules when exceeded.
- Prefer `const` over `let`. Never use `var`.
- Use early returns to reduce nesting.
- Avoid magic numbers and strings — define named constants.
- Prefer `async/await` over raw Promises and `.then()` chains.
- Use optional chaining (`?.`) and nullish coalescing (`??`) over manual null checks.
- No unused imports, variables, or parameters (enforced by ESLint).
- Destructure objects and arrays when accessing multiple properties.
- Avoid default exports. Use named exports exclusively for better refactoring support.

---

## API Response Consistency

- All endpoints return a consistent response envelope:

```typescript
interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorResponse {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
  timestamp: string;
}
```

- Use interceptors to wrap successful responses automatically.
- Paginated endpoints include `meta` with `total`, `page`, `pageSize`.

---

## Database Practices

- Use a repository pattern to abstract data access behind interfaces.
- Never call ORM/query-builder methods directly from services.
- Use database transactions for operations that modify multiple tables.
- Define entities/models separately from DTOs.
- Run migrations in CI/CD — never auto-sync schemas in production.
- Index columns used in `WHERE`, `JOIN`, and `ORDER BY` clauses.

---

## Performance Considerations

- Use pagination for all list endpoints. Never return unbounded collections.
- Apply caching (`@nestjs/cache-manager`) for expensive, idempotent operations.
- Use `Promise.all` for independent async operations that can run in parallel.
- Avoid N+1 queries — use eager loading or data loaders where appropriate.
- Set appropriate timeouts on external HTTP calls.

---

## Git and Code Quality

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- PRs should be small and focused. One logical change per PR.
- All PRs require passing CI (lint, test, build) before merge.
