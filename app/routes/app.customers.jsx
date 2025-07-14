import {
  BlockStack,
  Box,
  DataTable,
  LegacyCard,
  Page,
  Pagination,
  Button,
  Text,
  TextField,
  Modal,
  Toast,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { json, useLoaderData, useNavigate, useSubmit } from "@remix-run/react";
import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("direction") || "after";

  let queryParams = "(first: 5)";

  if (direction === "after" && cursor) {
    queryParams = `(first: 5, after: "${cursor}")`;
  } else if (direction === "before" && cursor) {
    queryParams = `(last: 5, before: "${cursor}")`;
  }

  const response = await admin.graphql(
    `#graphql
    query CustomerList {
      customers${queryParams} {
        nodes {
          id
          firstName
          lastName
          email
          phone
          createdAt
          updatedAt
          numberOfOrders
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }`,
  );

  const data = await response.json();
  return json({
    customers: data.data.customers.nodes,
    pageInfo: data.data.customers.pageInfo,
  });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const { customerId, phone } = JSON.parse(formData.get("data"));

  console.log("Updating customer:", customerId, "with phone:", phone);
  try {
    const response = await admin.graphql(
      `#graphql
      mutation customerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer {
            id
            phone
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          input: {
            id: customerId,
            phone: phone,
          },
        },
      },
    );

    const result = await response.json();

    if (result.data?.customerUpdate?.userErrors?.length > 0) {
      return json(
        {
          error: result.data.customerUpdate.userErrors[0].message,
        },
        { status: 400 },
      );
    }

    return json({
      success: true,
      updatedCustomer: result.data?.customerUpdate?.customer,
    });
  } catch (error) {
    return json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }
}

export default function CustomerList() {
  const { customers, pageInfo } = useLoaderData();
  const navigate = useNavigate();
  const submit = useSubmit();
  const appBridge = useAppBridge();
  const [editCustomer, setEditCustomer] = useState(null);
  const [editPhone, setEditPhone] = useState("");
  const [active, setActive] = useState(false);
  const [toastProps, setToastProps] = useState({
    active: false,
    content: "",
    error: false,
  });

  const handleNext = () => {
    if (pageInfo.hasNextPage) {
      navigate(`?cursor=${pageInfo.endCursor}&direction=after`);
    }
  };

  const handlePrevious = () => {
    if (pageInfo.hasPreviousPage) {
      navigate(`?cursor=${pageInfo.startCursor}&direction=before`);
    }
  };

  const handleOpenModal = (customer) => {
    setEditCustomer(customer);
    setEditPhone(customer.phone || "");
    setActive(true);
  };

  const handleUpdatePhone = () => {
    const formData = new FormData();
    formData.append(
      "data",
      JSON.stringify({
        customerId: editCustomer.id,
        phone: editPhone,
      }),
    );

    submit(formData, {
      method: "POST",
      replace: true,
      onSuccess: (response) => {
        const result = response.data;
        if (result?.error) {
          setToastProps({
            active: true,
            content: `Error: ${result.error}`,
            error: true,
          });
        } else {
          setToastProps({
            active: true,
            content: "Phone number updated successfully!",
            error: false,
          });
        }
        setActive(false);
      },
      onError: () => {
        setToastProps({
          active: true,
          content: "Failed to update phone number",
          error: true,
        });
        setActive(false);
      },
    });
  };

  const toggleToast = () =>
    setToastProps((prev) => ({ ...prev, active: false }));

  return (
    <Page title="Customer list">
      {toastProps.active && (
        <Toast
          content={toastProps.content}
          error={toastProps.error}
          onDismiss={toggleToast}
          duration={3000}
        />
      )}

      <LegacyCard>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Customer Name", "Mobile", "Email", "Action"]}
          rows={customers.map((customer) => [
            `${customer.firstName} ${customer.lastName}`,
            customer.phone || "N/A",
            customer.email,
            <Button onClick={() => handleOpenModal(customer)}>Edit</Button>,
          ])}
        />
      </LegacyCard>

      <BlockStack align="center" inlineAlign="center" padding={500}>
        <Box padding={500}>
          <Pagination
            hasNext={pageInfo?.hasNextPage}
            hasPrevious={pageInfo?.hasPreviousPage}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
        </Box>
      </BlockStack>

      <Modal
        open={active}
        onClose={() => setActive(false)}
        title="Edit Customer"
        primaryAction={{
          content: "Update",
          onAction: handleUpdatePhone,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setActive(false),
          },
        ]}
      >
        <Modal.Section>
          {editCustomer && (
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                {editCustomer.firstName} {editCustomer.lastName}
              </Text>
              <TextField label="Email" value={editCustomer.email} disabled />
              <TextField
                label="Phone Number"
                value={editPhone}
                onChange={setEditPhone}
                autoComplete="tel"
              />
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
